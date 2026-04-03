// ============================================================
// SATS VOUCHER — Cloudflare Worker v2.0
// Changes from v1.1:
//   - PIN system (4-digit, hashed with Web Crypto)
//   - New voucher states: active / pending / redeemed / expired / locked
//   - LNURL created on-demand at redemption (not at voucher creation)
//   - Full /v/:id Verification page with Transfer + Redeem flows
//   - POST /voucher/:id/transfer — rotate PIN
//   - POST /voucher/:id/redeem  — verify PIN, create LNURL, expose once
//   - History screen V.id bug fixed → v.id
//   - LNURL-withdraw generation and Blink payInvoice UNCHANGED
// ============================================================

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="34" height="34" style="flex-shrink:0"><rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000"/><circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" stroke-width="12"/><polygon points="285,30 175,270 245,270 215,470 325,230 255,230" fill="#FFD000" stroke="#0D0D0D" stroke-width="10" stroke-linejoin="round"/></svg>`;

const SHARED_CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Barlow:wght@300;400;600;800;900&family=Barlow+Condensed:wght@700;900&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --gold:#FFD000;--bg:#080808;--sur:#111111;--sur2:#181818;
  --bdr:#232323;--bdr2:#1a1a1a;--txt:#f0f0f0;--mut:#666;
  --red:#ff4444;--grn:#00cc55;
}
html,body{
  background:var(--bg);color:var(--txt);font-family:'Barlow',sans-serif;
  width:100%;height:100%;overflow:hidden;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;
}
.app{display:flex;flex-direction:column;width:100vw;height:100vh;overflow:hidden}
.hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;border-bottom:1px solid var(--bdr);
  flex-shrink:0;background:var(--bg);min-height:52px;
}
.logo-row{display:flex;align-items:center;gap:8px}
.w-sats{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px;color:var(--gold);letter-spacing:.5px;text-transform:uppercase}
.w-vch{font-family:'Barlow Condensed',sans-serif;font-weight:300;font-size:16px;color:#fff;letter-spacing:2.5px;text-transform:uppercase}
.hbtn{padding:5px 10px;border-radius:8px;border:1px solid var(--bdr);background:none;color:var(--mut);font-family:'Barlow',sans-serif;font-weight:600;font-size:12px;cursor:pointer}
.hbtn.gold{background:var(--gold);border-color:var(--gold);color:#0a0a0a;font-weight:800}
.back{display:flex;align-items:center;gap:4px;color:var(--gold);font-size:13px;font-weight:600;background:none;border:none;cursor:pointer}
.scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 14px}
.card{background:var(--sur);border-radius:12px;border:1px solid var(--bdr2);padding:12px;margin-bottom:10px}
.slabel{font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold);margin-bottom:6px}
.field{display:flex;flex-direction:column;gap:4px;margin-bottom:8px}
.field:last-child{margin-bottom:0}
.field label{color:var(--mut);font-size:11px;font-weight:600}
.field input,.field select{background:#161616;border:1px solid #1e1e1e;border-radius:8px;padding:9px 11px;color:#fff;font-size:14px;font-family:'DM Mono',monospace;width:100%;outline:none;-webkit-appearance:none;appearance:none}
.field input:focus,.field select:focus{border-color:var(--gold)}
.field input::placeholder{color:#2a2a2a}
.btn-p{background:var(--gold);border:none;border-radius:12px;height:52px;width:100%;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:18px;letter-spacing:1px;text-transform:uppercase;color:#0a0a0a;cursor:pointer;flex-shrink:0}
.btn-p:disabled{background:#1c1c00;color:#3a3a00;cursor:not-allowed}
.btn-s{background:var(--sur);border:1px solid var(--bdr);border-radius:12px;height:48px;width:100%;display:flex;align-items:center;justify-content:center;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:16px;color:#aaa;cursor:pointer;margin-top:8px}
.mono{font-family:'DM Mono',monospace}
.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%) translateY(8px);background:#1a1a1a;border:1px solid #333;border-radius:10px;padding:7px 16px;font-size:12px;color:#aaa;opacity:0;transition:all .2s;pointer-events:none;white-space:nowrap;z-index:999}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.spin{width:20px;height:20px;border:2px solid #333;border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
.kbtn{background:var(--sur);border:1px solid var(--bdr);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:400;color:var(--txt);cursor:pointer;min-height:0;width:100%;height:100%}
.kbtn:active{background:var(--sur2) !important;transform:scale(.94)}
.kbs{background:#130000 !important;border-color:#2a1010 !important;color:var(--red) !important;font-size:18px}
.kdot{color:#444;font-size:18px}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
`;

const SHARED_JS = `
const BRIDGE='http://localhost:8765';
const SK='sv_settings';
const DEF={
  storeName:'BOSA',subHeader:'SATS VOUCHER',
  currency:'EUR',currencySymbol:'€',
  minAmount:1,maxAmount:500,expiryDays:90,
  receiptHeader:'Thank you for your purchase',
  receiptFooter:'Non-refundable. Valid for stated period.',
  btcPriceSource:'live',manualBtcPrice:0,
};
function getSettings(){
  try{return Object.assign({},DEF,JSON.parse(localStorage.getItem(SK)||'{}'));}
  catch(e){return Object.assign({},DEF);}
}
function saveSettings(o){localStorage.setItem(SK,JSON.stringify(o));}
async function getBtcPrice(s){
  if(s.btcPriceSource==='manual'&&s.manualBtcPrice>0)return s.manualBtcPrice;
  var r=await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies='+s.currency.toLowerCase(),{signal:AbortSignal.timeout(6000)});
  var d=await r.json();return d.bitcoin[s.currency.toLowerCase()];
}
async function isBridge(){
  try{var r=await fetch(BRIDGE+'/status',{signal:AbortSignal.timeout(700)});return r.ok;}
  catch(e){return false;}
}
async function doPrint(p){
  var r=await fetch(BRIDGE+'/print',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
  if(!r.ok)throw new Error('Bridge print failed');
}
function toast(msg,ms){
  ms=ms||2500;
  var t=document.getElementById('toast');
  if(!t){t=document.createElement('div');t.id='toast';t.className='toast';document.body.appendChild(t);}
  t.textContent=msg;t.classList.add('show');
  clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('show');},ms);
}
function go(path){window.location.href=path;}
function logoHTML(){
  return '<div class="logo-row"><svg xmlns=\\"http://www.w3.org/2000/svg\\" viewBox=\\"0 0 500 500\\" width=\\"34\\" height=\\"34\\" style=\\"flex-shrink:0\\"><rect x=\\"0\\" y=\\"0\\" width=\\"500\\" height=\\"500\\" rx=\\"80\\" ry=\\"80\\" fill=\\"#FFD000\\"/><circle cx=\\"250\\" cy=\\"250\\" r=\\"190\\" fill=\\"#C8C8C8\\" stroke=\\"#0D0D0D\\" stroke-width=\\"12\\"/><polygon points=\\"285,30 175,270 245,270 215,470 325,230 255,230\\" fill=\\"#FFD000\\" stroke=\\"#0D0D0D\\" stroke-width=\\"10\\" stroke-linejoin=\\"round\\"/></svg><div style=\\"display:flex;align-items:baseline;gap:4px\\"><span class=\\"w-sats\\">Sats</span><span class=\\"w-vch\\">VOUCHER</span></div></div>';
}
`;

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<title>${title}</title>
<style>${SHARED_CSS}</style>
<script>${SHARED_JS}<\/script>
</head>
<body>
${body}
</body>
</html>`;
}

// ── SALE ──────────────────────────────────────────────────────

const SALE = page('Sale', `
<div class="app">
  <div class="hdr">
    <div id="logo"></div>
    <div style="display:flex;gap:6px">
      <button class="hbtn" onclick="go('/app/satscash')" style="background:rgba(255,208,0,.08);border-color:#3a3000;color:var(--gold)">SatsCASH</button>
      <button class="hbtn" onclick="go('/app/history')">History</button>
      <button class="hbtn" onclick="go('/app/settings')">Settings</button>
    </div>
  </div>

  <div style="padding:12px 16px 0;flex-shrink:0">
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:2px;
      padding-bottom:8px;border-bottom:1px solid var(--bdr)">
      <span id="sym" style="font-weight:300;font-size:28px;color:var(--gold);line-height:1;padding-bottom:7px">&#8364;</span>
      <span id="whole" style="font-weight:200;font-size:60px;color:var(--txt);letter-spacing:-2px;line-height:1;font-variant-numeric:tabular-nums">0</span>
      <span id="cents" style="font-weight:200;font-size:60px;color:#555;letter-spacing:-2px;line-height:1;font-variant-numeric:tabular-nums">.00</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:5px;height:30px">
      <div style="width:5px;height:5px;border-radius:50%;background:var(--grn);flex-shrink:0;animation:pulse 2s ease-in-out infinite"></div>
      <span id="bval" class="mono" style="font-size:12px;color:#888">0.00000000 BTC</span>
      <span id="brate" class="mono" style="font-size:10px;color:#3a3a3a"></span>
    </div>
  </div>

  <div style="flex:1;padding:4px 12px 8px;display:flex;flex-direction:column;gap:5px;min-height:0">
    <div style="display:flex;justify-content:space-between;padding:0 2px">
      <span id="minlbl" class="mono" style="font-size:10px;color:#333">MIN &#8364;1.00</span>
      <span id="maxlbl" class="mono" style="font-size:10px;color:#333">MAX &#8364;500.00</span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);gap:6px;flex:1;min-height:0">
      <button class="kbtn" id="k1">1</button>
      <button class="kbtn" id="k2">2</button>
      <button class="kbtn" id="k3">3</button>
      <button class="kbtn" id="k4">4</button>
      <button class="kbtn" id="k5">5</button>
      <button class="kbtn" id="k6">6</button>
      <button class="kbtn" id="k7">7</button>
      <button class="kbtn" id="k8">8</button>
      <button class="kbtn" id="k9">9</button>
      <button class="kbtn kdot" id="kdot">&#183;</button>
      <button class="kbtn" id="k0">0</button>
      <button class="kbtn kbs" id="kbs">&#9003;</button>
    </div>

    <button class="btn-p" id="pbtn" disabled onclick="handlePrint()">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:7px;flex-shrink:0">
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
      Print Voucher
    </button>
  </div>
</div>

<script>
document.getElementById('logo').innerHTML=logoHTML();
var digits='',price=null,S=getSettings();
var sym=S.currencySymbol||'€';
document.getElementById('sym').textContent=sym;
document.getElementById('minlbl').textContent='MIN '+sym+parseFloat(S.minAmount).toFixed(2);
document.getElementById('maxlbl').textContent='MAX '+sym+parseFloat(S.maxAmount).toFixed(2);

getBtcPrice(S).then(function(p){
  price=p;
  document.getElementById('brate').textContent='@ '+sym+p.toLocaleString()+'/BTC';
  render();
}).catch(function(){document.getElementById('brate').textContent='price unavailable';});

function amt(){
  if(!digits)return 0;
  var p=digits.length<3?('00'+digits).slice(-3):digits;
  return parseFloat(p.slice(0,-2)+'.'+p.slice(-2));
}
function render(){
  var a=amt();
  var w=Math.floor(a),c=(a-w).toFixed(2).slice(1);
  document.getElementById('whole').textContent=w;
  document.getElementById('cents').textContent=c;
  var col=a>S.maxAmount?'var(--red)':a>=S.minAmount?'#fff':'var(--txt)';
  document.getElementById('whole').style.color=col;
  document.getElementById('cents').style.color=a>S.maxAmount?'var(--red)':'#555';
  if(price&&a>0)document.getElementById('bval').textContent=(a/price).toFixed(8)+' BTC';
  document.getElementById('pbtn').disabled=!(a>=S.minAmount&&a<=S.maxAmount&&price);
}
function key(k){
  if(k==='bs'){digits=digits.slice(0,-1);}
  else if(k==='.'){/* implied */}
  else{if(digits.length>=8)return;digits=(digits+k).replace(/^0+/,'')||'';}
  render();
}
document.getElementById('k1').addEventListener('click',function(){key('1');});
document.getElementById('k2').addEventListener('click',function(){key('2');});
document.getElementById('k3').addEventListener('click',function(){key('3');});
document.getElementById('k4').addEventListener('click',function(){key('4');});
document.getElementById('k5').addEventListener('click',function(){key('5');});
document.getElementById('k6').addEventListener('click',function(){key('6');});
document.getElementById('k7').addEventListener('click',function(){key('7');});
document.getElementById('k8').addEventListener('click',function(){key('8');});
document.getElementById('k9').addEventListener('click',function(){key('9');});
document.getElementById('k0').addEventListener('click',function(){key('0');});
document.getElementById('kdot').addEventListener('click',function(){key('.');});
document.getElementById('kbs').addEventListener('click',function(){key('bs');});
document.addEventListener('keydown',function(e){
  if(e.key>='0'&&e.key<='9'){key(e.key);}
  if(e.key==='Backspace'){e.preventDefault();key('bs');}
});

async function handlePrint(){
  var a=amt();if(!a||!price)return;
  var btn=document.getElementById('pbtn');
  btn.innerHTML='<div class="spin"></div>';btn.disabled=true;
  try{
    var btc=(a/price).toFixed(8);
    var exp=new Date();exp.setDate(exp.getDate()+(S.expiryDays||90));
    // POST /voucher — server generates PIN, returns it once only
    var res=await fetch('/voucher',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        amountBtc:btc,
        amountFiat:a.toFixed(2),
        currency:S.currency||'EUR',
        currencySymbol:sym,
        expiryDays:S.expiryDays||90,
        storeName:S.storeName||'BOSA'
      })});
    var d=await res.json();
    if(!d.id)throw new Error(d.error||'No ID returned');
    // Store in sessionStorage for confirm screen
    // pin is returned once here and printed on receipt — never stored plain text after this
    sessionStorage.setItem('sv_v',JSON.stringify({
      id:d.id,
      pin:d.pin,
      amountFiat:a.toFixed(2),
      amountBtc:btc,
      currency:S.currency||'EUR',
      currencySymbol:sym,
      btcPriceAtSale:price,
      createdAt:new Date().toISOString(),
      expiryDate:exp.toISOString()
    }));
    go('/app/confirm');
  }catch(e){
    toast('Error: '+e.message);
    btn.textContent='Print Voucher';btn.disabled=false;
  }
}
<\/script>
`);

// ── CONFIRM ───────────────────────────────────────────────────
// QR now shows /v/:id URL (not LNURL)
// PIN is shown once and printed on receipt

const CONFIRM = page('Confirm', `
<div class="app">
  <div class="hdr">
    <button class="back" onclick="go('/app')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD000" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      New Sale
    </button>
    <div id="logo"></div>
    <div style="width:60px"></div>
  </div>
  <div class="scroll">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <span style="color:#fff;font-size:16px;font-weight:700">Voucher Created</span>
      <span id="badge" style="padding:3px 10px;border-radius:20px;border:1px solid var(--gold);font-size:10px;font-weight:700;color:var(--gold)">Ready to print</span>
    </div>

    <div class="card" style="text-align:center">
      <div id="famt" style="color:var(--gold);font-size:42px;font-weight:200;line-height:1"></div>
      <div id="bamt" class="mono" style="color:#888;font-size:13px;margin-top:4px"></div>
      <div id="rate" class="mono" style="color:#444;font-size:11px;margin-top:2px"></div>
    </div>

    <!-- QR shows /v/:id — the verification page URL -->
    <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:8px">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:#444;text-transform:uppercase;margin-bottom:2px">Verification QR</div>
      <div id="qrw" style="width:160px;height:160px;background:#f8f8f8;border-radius:4px;display:flex;align-items:center;justify-content:center">
        <div class="spin" style="border-top-color:#333;border-color:#ddd"></div>
      </div>
      <div id="vid" class="mono" style="color:#555;font-size:12px;font-weight:700;letter-spacing:2px"></div>
    </div>

    <!-- PIN shown once — printed on receipt -->
    <div class="card" style="border-color:#2a2000">
      <div style="font-size:10px;font-weight:700;letter-spacing:1px;color:var(--gold);text-transform:uppercase;margin-bottom:8px">Initial PIN — printed on receipt</div>
      <div id="pindisp" class="mono" style="font-size:36px;font-weight:700;color:var(--gold);letter-spacing:8px;text-align:center;padding:8px 0"></div>
      <div style="font-size:11px;color:#555;text-align:center;margin-top:4px">Holder should change PIN on first transfer</div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px">
        <span style="color:#555;font-size:12px">Issued</span>
        <span id="idate" style="color:#ccc;font-size:12px;font-weight:600"></span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="color:#555;font-size:12px">Expires</span>
        <span id="edate" style="color:#ccc;font-size:12px;font-weight:600"></span>
      </div>
    </div>

    <button class="btn-p" id="pbtn" onclick="handlePrint()">Print Receipt</button>
    <button class="btn-p" id="nsbtn" style="display:none" onclick="go('/app')">New Sale</button>
    <div style="height:16px"></div>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
<script>
document.getElementById('logo').innerHTML=logoHTML();
var V=JSON.parse(sessionStorage.getItem('sv_v')||'null');
var S=getSettings();
if(!V){go('/app');}
else{
  var sym=V.currencySymbol||'€';
  document.getElementById('famt').textContent=sym+parseFloat(V.amountFiat).toFixed(2);
  document.getElementById('bamt').textContent=V.amountBtc+' BTC';
  document.getElementById('rate').textContent='Rate: '+sym+parseFloat(V.btcPriceAtSale).toLocaleString()+'/BTC';
  document.getElementById('vid').textContent='ID: '+V.id.toUpperCase();
  document.getElementById('idate').textContent=new Date(V.createdAt).toLocaleDateString('en-GB');
  document.getElementById('edate').textContent=new Date(V.expiryDate).toLocaleDateString('en-GB');
  document.getElementById('pindisp').textContent=V.pin||'----';

  // QR encodes the /v/:id verification page URL — NOT the lnurl
  var verifyUrl=window.location.origin+'/v/'+V.id;
  QRCode.toCanvas(verifyUrl,{width:160,margin:1,color:{dark:'#000',light:'#fff'}},function(err,canvas){
    var w=document.getElementById('qrw');
    if(err){w.innerHTML='<span style="color:#f44;font-size:11px">QR error</span>';return;}
    canvas.style.borderRadius='4px';w.replaceWith(canvas);
  });
}

async function handlePrint(){
  if(!V)return;
  var btn=document.getElementById('pbtn');
  btn.innerHTML='<div class="spin"></div>';btn.disabled=true;
  var sym=V.currencySymbol||'€';
  var on=await isBridge();
  if(on){
    try{
      await doPrint({
        storeName:S.storeName||'BOSA',
        headerLine:S.receiptHeader||'',
        amount:sym+parseFloat(V.amountFiat).toFixed(2),
        btcAmount:V.amountBtc+' BTC',
        voucherId:V.id.toUpperCase(),
        // QR on printed receipt points to /v/:id verification page
        // PIN deliberately not printed — customer writes it on the back themselves
        qrData:window.location.origin+'/v/'+V.id,
        issuedDate:new Date(V.createdAt).toLocaleDateString('en-GB'),
        expiryDate:new Date(V.expiryDate).toLocaleDateString('en-GB'),
        footerLine:S.receiptFooter||''
      });
      toast('Receipt printed');
    }catch(e){toast('Print error: '+e.message);}
  }else{toast('Printer not available');}
  var b=document.getElementById('badge');
  b.textContent='Printed';b.style.borderColor='var(--grn)';b.style.color='var(--grn)';
  // Hide print button — no reprint allowed from confirm screen
  btn.style.display='none';
  document.getElementById('nsbtn').style.display='flex';
}
<\/script>
`);

// ── HISTORY ───────────────────────────────────────────────────
// Fixed: V.id → v.id in reprint qrData
// Updated: state labels include pending/locked

const HISTORY = page('History', `
<div style="display:flex;flex-direction:column;width:100vw;height:100vh;overflow:hidden;background:#080808">
  <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #232323;flex-shrink:0;min-height:52px">
    <button class="back" onclick="go('/app')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD000" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      Back
    </button>
    <div id="logo"></div>
    <div style="width:60px"></div>
  </div>
  <div id="list" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:10px 14px;min-height:0">
    <div style="color:#555;padding:20px;text-align:center">Loading...</div>
  </div>
</div>
<script>
document.getElementById('logo').innerHTML=logoHTML();
var S=getSettings();
var SC={active:'var(--grn)',pending:'var(--gold)',redeemed:'#555',claimed:'#555',expired:'var(--red)',locked:'#ff8800'};
var SL={active:'Active',pending:'Pending',redeemed:'Redeemed',claimed:'Redeemed',expired:'Expired',locked:'Locked'};
function gsym(v){return v.currencySymbol||(v.currency==='EUR'?'€':v.currency==='GBP'?'£':'$');}

async function load(){
  var el=document.getElementById('list');
  if(!el){return;}
  el.innerHTML='<div style="color:#555;padding:20px;text-align:center;font-size:13px">Loading vouchers...</div>';
  try{
    var r=await fetch('/vouchers');
    var raw=await r.text();
    var vs;
    try{vs=JSON.parse(raw);}catch(pe){
      el.innerHTML='<div style="color:#f44;padding:20px;font-size:12px">Parse error: '+raw.slice(0,200)+'</div>';
      return;
    }
    if(!Array.isArray(vs)){
      el.innerHTML='<div style="color:#f44;padding:20px;font-size:12px">API error: '+JSON.stringify(vs).slice(0,200)+'</div>';
      return;
    }
    if(!vs.length){
      el.innerHTML='<div style="text-align:center;color:#555;padding:40px;font-size:14px">No vouchers yet</div>';
      return;
    }
    var html='';
    for(var i=0;i<vs.length;i++){
      var v=vs[i];
      var s=gsym(v);
      var col=SC[v.status]||'#888';
      var lbl=SL[v.status]||(v.status||'Unknown');
      var dt=v.createdAt?new Date(v.createdAt).toLocaleDateString('en-GB'):'--';
      var expD=v.expiryDate?new Date(v.expiryDate):null;
      var exp=(expD&&!isNaN(expD))?expD.toLocaleDateString('en-GB'):'--';
      var vid=(v.id||'').toUpperCase();
      html+=
        '<div class="card">'+
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'+
            '<div>'+
              '<div style="color:#fff;font-size:18px;font-weight:600">'+s+parseFloat(v.amountFiat||0).toFixed(2)+'</div>'+
              '<div style="color:#555;font-size:11px;margin-top:2px;font-family:monospace">'+parseFloat(v.amountBtc||0).toFixed(8)+' BTC</div>'+
              '<div style="color:#3a3a3a;font-size:10px;margin-top:2px;font-family:monospace">'+dt+' &middot; '+vid+'</div>'+
              '<div style="color:#555;font-size:10px;margin-top:1px;font-family:monospace">Expires: '+exp+'</div>'+
            '</div>'+
            '<span style="padding:3px 9px;border-radius:20px;border:1px solid '+col+';color:'+col+';font-size:10px;font-weight:700;flex-shrink:0">'+lbl+'</span>'+
          '</div>'+
          '<div style="display:flex;gap:7px">'+
            '<button data-id="'+v.id+'" data-action="chk" style="flex:1;padding:8px 0;border-radius:9px;border:1px solid #FFD000;background:rgba(255,208,0,.04);color:#FFD000;font-weight:700;font-size:11px;cursor:pointer">Check</button>'+
            '<button data-id="'+v.id+'" data-action="rep" style="flex:1;padding:8px 0;border-radius:9px;border:1px solid #232323;background:none;color:#555;font-weight:700;font-size:11px;cursor:pointer">Reprint</button>'+
          '</div>'+
        '</div>';
    }
    el.innerHTML=html;
    // Delegated click for chk/rep buttons
    el.addEventListener('click',function(e){
      var btn=e.target;
      if(!btn.dataset.action)return;
      if(btn.dataset.action==='chk')chk(btn.dataset.id);
      if(btn.dataset.action==='rep')rep(btn.dataset.id);
    });
  }catch(e){
    document.getElementById('list').innerHTML='<div style="color:#f44;padding:20px;font-size:13px">Error: '+e.message+'</div>';
  }
}


async function chk(id){
  try{
    var r=await fetch('/voucher/'+id);var v=await r.json();
    var lbl=SL[v.status]||v.status;
    var msg=id.toUpperCase()+': '+lbl;
    if(v.redeemedAt)msg+=' ('+new Date(v.redeemedAt).toLocaleDateString('en-GB')+')';
    else if(v.claimedAt)msg+=' ('+new Date(v.claimedAt).toLocaleDateString('en-GB')+')';
    if(v.redeemLockedUntil&&v.status==='locked'){
      var unlocks=new Date(v.redeemLockedUntil);
      msg+=' — unlocks '+unlocks.toLocaleDateString('en-GB')+' '+unlocks.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    }
    toast(msg,4000);
  }catch(e){toast('Check failed');}
}

async function rep(id){
  var on=await isBridge();if(!on){toast('Printer not available');return;}
  try{
    var r=await fetch('/voucher/'+id);var v=await r.json();var s=gsym(v);
    // Fixed: was V.id (undefined), now correctly v.id
    await doPrint({
      storeName:S.storeName||'BOSA',
      headerLine:S.receiptHeader||'',
      amount:s+parseFloat(v.amountFiat||0).toFixed(2),
      btcAmount:parseFloat(v.amountBtc||0).toFixed(8)+' BTC',
      voucherId:id.toUpperCase(),
      // Note: PIN is not reprinted for security — holder already has it
      qrData:window.location.origin+'/v/'+v.id,
      issuedDate:v.createdAt?new Date(v.createdAt).toLocaleDateString('en-GB'):'',
      expiryDate:v.expiryDate?new Date(v.expiryDate).toLocaleDateString('en-GB'):'',
      footerLine:S.receiptFooter||''
    });
    toast('Reprinted');
  }catch(e){toast('Reprint failed: '+e.message);}
}
load();
<\/script>
`);

// ── SETTINGS ──────────────────────────────────────────────────
// Unchanged from v1.1

const SETTINGS = page('Settings', `
<div class="app">
  <div class="hdr">
    <button class="back" onclick="go('/app')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD000" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      Back
    </button>
    <div id="logo"></div>
    <button class="hbtn gold" onclick="doSave()">Save</button>
  </div>
  <div class="scroll">
    <div class="slabel">Store</div>
    <div class="card">
      <div class="field"><label>Store name</label><input id="sn" type="text" placeholder="BOSA"></div>
      <div class="field"><label>Sub-header</label><input id="sh" type="text" placeholder="SATS VOUCHER"></div>
    </div>
    <div class="slabel" style="margin-top:10px">Currency</div>
    <div class="card">
      <div class="field">
        <label>Display currency</label>
        <select id="cur">
          <option value="EUR">&#8364; EUR</option>
          <option value="GBP">&#163; GBP</option>
          <option value="USD">&#36; USD</option>
        </select>
      </div>
    </div>
    <div class="slabel" style="margin-top:10px">Voucher rules</div>
    <div class="card">
      <div style="display:flex;gap:8px">
        <div class="field" style="flex:1"><label>Min amount</label><input id="mn" type="number" placeholder="1"></div>
        <div class="field" style="flex:1"><label>Max amount</label><input id="mx" type="number" placeholder="500"></div>
      </div>
      <div class="field"><label>Expiry (days)</label><input id="ex" type="number" placeholder="90"></div>
    </div>
    <div class="slabel" style="margin-top:10px">Receipt</div>
    <div class="card">
      <div class="field"><label>Header line</label><input id="rh" type="text" placeholder="Thank you for your purchase"></div>
      <div class="field"><label>Footer line</label><input id="rf" type="text" placeholder="Non-refundable. Valid for stated period."></div>
    </div>
    <div class="slabel" style="margin-top:10px">BTC price</div>
    <div class="card">
      <div class="field">
        <label>Price source</label>
        <select id="ps" onchange="toggleManual()">
          <option value="live">Live (CoinGecko)</option>
          <option value="manual">Manual / fixed rate</option>
        </select>
      </div>
      <div class="field" id="mpf" style="display:none">
        <label>Fixed BTC price</label>
        <input id="mp" type="number" placeholder="e.g. 95000">
      </div>
    </div>
    <button class="btn-p" onclick="doSave()" style="margin-top:14px">Save Settings</button>
    <div style="height:24px"></div>
  </div>
</div>
<script>
document.getElementById('logo').innerHTML=logoHTML();
var S=getSettings();
document.getElementById('sn').value=S.storeName;
document.getElementById('sh').value=S.subHeader;
document.getElementById('cur').value=S.currency;
document.getElementById('mn').value=S.minAmount;
document.getElementById('mx').value=S.maxAmount;
document.getElementById('ex').value=S.expiryDays;
document.getElementById('rh').value=S.receiptHeader;
document.getElementById('rf').value=S.receiptFooter;
document.getElementById('ps').value=S.btcPriceSource;
document.getElementById('mp').value=S.manualBtcPrice||'';
toggleManual();
function toggleManual(){
  document.getElementById('mpf').style.display=document.getElementById('ps').value==='manual'?'flex':'none';
}
var SYM={EUR:'€',GBP:'£',USD:'$'};
function doSave(){
  var cur=document.getElementById('cur').value;
  saveSettings({
    storeName:document.getElementById('sn').value||'BOSA',
    subHeader:document.getElementById('sh').value||'SATS VOUCHER',
    currency:cur,currencySymbol:SYM[cur]||'€',
    minAmount:parseFloat(document.getElementById('mn').value)||1,
    maxAmount:parseFloat(document.getElementById('mx').value)||500,
    expiryDays:parseInt(document.getElementById('ex').value)||90,
    receiptHeader:document.getElementById('rh').value,
    receiptFooter:document.getElementById('rf').value,
    btcPriceSource:document.getElementById('ps').value,
    manualBtcPrice:parseFloat(document.getElementById('mp').value)||0,
  });
  toast('Settings saved');
  setTimeout(function(){go('/app');},800);
}
<\/script>
`);

// ============================================================
// PIN UTILITIES — Web Crypto API (Workers runtime built-in)
// ============================================================

// Generate a random 4-digit PIN string e.g. "4821"
function generatePin() {
  const n = Math.floor(1000 + Math.random() * 9000);
  return String(n);
}

// Hash a PIN with a salt using SHA-256
// Returns { hash: hex string, salt: hex string }
async function hashPin(pin, saltHex) {
  const salt = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const encoder = new TextEncoder();
  const data = new Uint8Array([...salt, ...encoder.encode(pin)]);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return {
    hash: bytesToHex(new Uint8Array(hashBuf)),
    salt: bytesToHex(salt)
  };
}

// Verify a PIN against stored hash + salt
async function verifyPin(pin, storedHash, storedSalt) {
  const { hash } = await hashPin(pin, storedSalt);
  return hash === storedHash;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

// ============================================================
// EXPIRY HELPERS
// ============================================================

function isExpired(v) {
  if (!v.expiryDate) return false;
  return new Date(v.expiryDate) < new Date();
}

function isLocked(v) {
  if (v.status !== 'locked') return false;
  if (!v.redeemLockedUntil) return false;
  // Auto-unlock if lockout period has passed
  return new Date(v.redeemLockedUntil) > new Date();
}

// ============================================================
// VERIFICATION PAGE — /v/:id
// Full client-side flow: Transfer + Redeem with PIN
// ============================================================

function verificationPage(v, id, origin) {
  const sym = v.currencySymbol || (v.currency === 'EUR' ? '€' : v.currency === 'GBP' ? '£' : '$');
  const issuedStr = v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-GB') : '—';
  const expiryStr = v.expiryDate ? new Date(v.expiryDate).toLocaleDateString('en-GB') : '—';

  // Determine display state — expiry overrides all
  let displayStatus = v.status;
  if (isExpired(v) && v.status !== 'redeemed') displayStatus = 'expired';
  if (isLocked(v)) displayStatus = 'locked';

  const statusColors = {
    active:   '#00cc55',
    pending:  '#FFD000',
    redeemed: '#555555',
    expired:  '#ff4444',
    locked:   '#ff8800'
  };
  const statusLabels = {
    active:   'Active',
    pending:  'Pending Redemption',
    redeemed: 'Redeemed',
    expired:  'Expired',
    locked:   'Locked — too many attempts'
  };

  const sc = statusColors[displayStatus] || '#555';
  const sl = statusLabels[displayStatus] || displayStatus;
  const canAct = displayStatus === 'active';

  // Lockout message
  let lockMsg = '';
  if (displayStatus === 'locked' && v.redeemLockedUntil) {
    const unlocks = new Date(v.redeemLockedUntil);
    lockMsg = `Try again after ${unlocks.toLocaleDateString('en-GB')} ${unlocks.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})}`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>Voucher ${id.toUpperCase()} — Sats VOUCHER</title>
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Barlow:wght@300;400;600;800&family=Barlow+Condensed:wght@700;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
:root{--gold:#FFD000;--bg:#080808;--sur:#111;--bdr:#222;--txt:#f0f0f0;--mut:#555;--red:#ff4444;--grn:#00cc55}
body{background:var(--bg);color:var(--txt);font-family:'Barlow',sans-serif;min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:20px}
.wrap{width:100%;max-width:400px}
.logo-row{display:flex;align-items:center;gap:8px;margin-bottom:20px;justify-content:center}
.w-sats{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:18px;color:var(--gold);letter-spacing:.5px;text-transform:uppercase}
.w-vch{font-family:'Barlow Condensed',sans-serif;font-weight:300;font-size:18px;color:#fff;letter-spacing:2.5px;text-transform:uppercase}
.card{background:var(--sur);border-radius:16px;border:1px solid var(--bdr);padding:20px;margin-bottom:12px}
.amount{font-size:52px;font-weight:200;color:var(--gold);line-height:1;text-align:center}
.btc{font-size:15px;color:#555;margin-top:6px;font-family:'DM Mono',monospace;text-align:center}
.badge{display:inline-flex;align-items:center;padding:5px 14px;border-radius:20px;border:1px solid ${sc};color:${sc};font-size:12px;font-weight:700}
.row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #161616}
.row:last-child{border-bottom:none}
.lbl{color:var(--mut);font-size:13px}
.val{color:#ccc;font-size:13px;font-weight:600;font-family:'DM Mono',monospace}
/* Action buttons */
.btn-act{width:100%;height:54px;border-radius:14px;border:none;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:18px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px}
.btn-transfer{background:transparent;border:1px solid var(--gold) !important;color:var(--gold)}
.btn-redeem{background:var(--gold);color:#0a0a0a}
.btn-disabled{background:#1a1a1a;color:#333;border:1px solid #1a1a1a !important;cursor:not-allowed}
/* Modal overlay */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:flex-end;justify-content:center;z-index:100;padding:0}
.modal{background:#111;border-radius:20px 20px 0 0;border:1px solid #222;border-bottom:none;width:100%;max-width:400px;padding:24px;padding-bottom:40px;max-height:90vh;overflow-y:auto;-webkit-overflow-scrolling:touch}
.modal-title{font-size:16px;font-weight:700;color:#fff;margin-bottom:4px}
.modal-sub{font-size:12px;color:#555;margin-bottom:20px}
/* PIN dots input */
.pin-row{display:flex;gap:12px;justify-content:center;margin-bottom:20px}
.pin-dot{width:52px;height:60px;border-radius:12px;border:1px solid #2a2a2a;background:#161616;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:var(--gold);font-family:'DM Mono',monospace}
.pin-dot.filled{border-color:#444}
/* PIN keypad */
.pkb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px}
.pkb{height:52px;border-radius:12px;border:1px solid #222;background:#161616;color:#fff;font-size:22px;font-weight:400;cursor:pointer;font-family:'Barlow',sans-serif}
.pkb:active{background:#222}
.pkb-del{background:#1a0000;border-color:#2a1010;color:var(--red);font-size:16px}
/* Text input for new PIN confirm */
.inp{width:100%;background:#161616;border:1px solid #2a2a2a;border-radius:10px;padding:12px;color:#fff;font-size:18px;font-family:'DM Mono',monospace;text-align:center;letter-spacing:6px;outline:none;margin-bottom:12px}
.inp:focus{border-color:var(--gold)}
.err{color:var(--red);font-size:12px;text-align:center;margin-bottom:12px;min-height:18px}
.btn-modal{width:100%;height:50px;border-radius:12px;border:none;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:17px;letter-spacing:1px;text-transform:uppercase;cursor:pointer;margin-bottom:8px}
.btn-confirm{background:var(--gold);color:#0a0a0a}
.btn-cancel{background:transparent;border:1px solid #2a2a2a !important;color:#555}
/* QR display */
.qr-wrap{display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px 0}
.qr-canvas{border-radius:8px}
.warning-box{background:#1a1200;border:1px solid #3a2a00;border-radius:10px;padding:12px;font-size:12px;color:#aa8800;margin-bottom:16px;line-height:1.5}
.spin{width:20px;height:20px;border:2px solid #333;border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;display:inline-block}
@keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrap">

  <!-- Header -->
  <div class="logo-row">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="28" height="28"><rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000"/><circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" stroke-width="12"/><polygon points="285,30 175,270 245,270 215,470 325,230 255,230" fill="#FFD000" stroke="#0D0D0D" stroke-width="10" stroke-linejoin="round"/></svg>
    <div style="display:flex;align-items:baseline;gap:4px">
      <span class="w-sats">Sats</span><span class="w-vch">VOUCHER</span>
    </div>
  </div>

  <!-- Amount card -->
  <div class="card" style="text-align:center">
    <div class="amount">${sym}${parseFloat(v.amountFiat || 0).toFixed(2)}</div>
    <div class="btc">${parseFloat(v.amountBtc || 0).toFixed(8)} BTC</div>
    <div style="margin-top:14px">
      <span class="badge">${sl}</span>
    </div>
    ${lockMsg ? `<div style="font-size:11px;color:#ff8800;margin-top:8px">${lockMsg}</div>` : ''}
  </div>

  <!-- Details card -->
  <div class="card">
    <div class="row"><span class="lbl">Voucher ID</span><span class="val">${id.toUpperCase()}</span></div>
    <div class="row"><span class="lbl">Store</span><span class="val" style="font-family:'Barlow',sans-serif">${v.storeName || '—'}</span></div>
    <div class="row"><span class="lbl">Issued</span><span class="val">${issuedStr}</span></div>
    <div class="row"><span class="lbl">Expires</span><span class="val">${expiryStr}</span></div>
  </div>

  <!-- Action buttons -->
  <button class="btn-act btn-transfer ${canAct ? '' : 'btn-disabled'}" id="btnTransfer" onclick="openTransfer()" ${canAct ? '' : 'disabled'}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
    Transfer
  </button>
  <button class="btn-act btn-redeem ${canAct ? '' : 'btn-disabled'}" id="btnRedeem" onclick="openRedeem()" ${canAct ? '' : 'disabled'}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    Redeem
  </button>

  ${displayStatus === 'pending' ? `
  <div style="background:#1a1400;border:1px solid #3a3000;border-radius:12px;padding:14px;font-size:12px;color:#aa8800;line-height:1.6;margin-bottom:12px">
    ⚡ A redemption QR was already revealed for this voucher. If you have not yet used it, open your Lightning wallet and scan the saved QR code. If the QR was lost, contact the issuing store.
  </div>` : ''}

  <div style="height:20px"></div>
</div>

<!-- ── TRANSFER MODAL ── -->
<!-- Content is built dynamically by openTransfer() each time -->
<div class="overlay" id="overlayTransfer" style="display:none" onclick="closeModals(event,this)">
  <div class="modal" onclick="event.stopPropagation()"></div>
</div>

<!-- ── REDEEM MODAL ── -->
<div class="overlay" id="overlayRedeem" style="display:none" onclick="closeModals(event,this)">
  <div class="modal" onclick="event.stopPropagation()">

    <div id="rdStep1">
      <div class="modal-title">Redeem Voucher</div>
      <div class="modal-sub">Enter your 4-digit PIN to reveal the Lightning QR code</div>
      <div class="warning-box">
        ⚠️ The QR code is revealed <strong>once only</strong>. Save it to your device before closing. Open it in a Lightning wallet to claim your funds.
      </div>
      <div style="font-size:11px;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Your PIN — <span id="attemptsLeft">3</span> attempt(s) remaining</div>
      <div class="pin-row">
        <div class="pin-dot" id="rd0">·</div>
        <div class="pin-dot" id="rd1">·</div>
        <div class="pin-dot" id="rd2">·</div>
        <div class="pin-dot" id="rd3">·</div>
      </div>
      <div class="pkb-grid">
        <button class="pkb" onclick="rdKey('1')">1</button><button class="pkb" onclick="rdKey('2')">2</button><button class="pkb" onclick="rdKey('3')">3</button>
        <button class="pkb" onclick="rdKey('4')">4</button><button class="pkb" onclick="rdKey('5')">5</button><button class="pkb" onclick="rdKey('6')">6</button>
        <button class="pkb" onclick="rdKey('7')">7</button><button class="pkb" onclick="rdKey('8')">8</button><button class="pkb" onclick="rdKey('9')">9</button>
        <button class="pkb" onclick="rdKey('0')" style="grid-column:2">0</button>
        <button class="pkb pkb-del" onclick="rdDel()">⌫</button>
      </div>
      <div class="err" id="rdErr"></div>
      <button class="btn-modal btn-confirm" id="rdSubmitBtn" onclick="rdSubmit()" disabled>Reveal QR Code</button>
      <button class="btn-modal btn-cancel" onclick="closeAll()">Cancel</button>
    </div>

    <div id="rdStep2" style="display:none">
      <!-- Content built dynamically by rdSubmit after QR is generated -->
    </div>

  </div>
</div>

<script>
var VOUCHER_ID = '${id}';
var API_ORIGIN = '${origin}';

// ── Transfer flow state
var tfCurPin = '', tfNewPin = '', tfCfmPin = '';

function tfKey(d) {
  if (tfCurPin.length >= 4) return;
  tfCurPin += d;
  updateDots('tcd', tfCurPin);
  document.getElementById('tfErr').textContent = '';
  if (tfCurPin.length === 4) {
    // Auto-advance suggestion — user must press Verify
  }
}
function tfDel() { tfCurPin = tfCurPin.slice(0, -1); updateDots('tcd', tfCurPin); }

function tnKey(d) {
  if (tfNewPin.length >= 4) return;
  tfNewPin += d;
  updateDots('tnd', tfNewPin);
  var ne = document.getElementById('tfNewErr'); if(ne) ne.textContent = '';
  if (tfNewPin.length === 4) {
    // Build filled summary dots for new PIN on confirm screen
    var summary = document.getElementById('tfNewPinSummary');
    if (summary) {
      var sh = '';
      for (var i = 0; i < 4; i++) sh += '<div class="pin-dot filled" style="border-color:#444">&#9679;</div>';
      summary.innerHTML = sh;
    }
    document.getElementById('tfStep2').style.display = 'none';
    document.getElementById('tfStep2Confirm').style.display = 'block';
  }
}
function tnDel() {
  tfNewPin = tfNewPin.slice(0, -1);
  updateDots('tnd', tfNewPin);
  // If backspace from confirm screen, go back to new PIN entry
  if (document.getElementById('tfStep2Confirm').style.display !== 'none') {
    document.getElementById('tfStep2Confirm').style.display = 'none';
    document.getElementById('tfStep2').style.display = 'block';
    tfCfmPin = '';
    updateDotsC('');
  }
}

function tcKey(d) {
  if (tfCfmPin.length >= 4) return;
  tfCfmPin += d;
  updateDotsC(tfCfmPin);
  document.getElementById('tfCfmErr').textContent = '';
  if (tfCfmPin.length === 4) {
    document.getElementById('tfSubmitBtn').disabled = false;
  }
}
function tcDel() {
  tfCfmPin = tfCfmPin.slice(0, -1);
  updateDotsC(tfCfmPin);
  document.getElementById('tfSubmitBtn').disabled = true;
}

function updateDots(prefix, val) {
  for (var i = 0; i < 4; i++) {
    var el = document.getElementById(prefix + i);
    if (!el) continue;
    if (i < val.length) { el.textContent = '●'; el.classList.add('filled'); }
    else { el.textContent = '·'; el.classList.remove('filled'); }
  }
}
function updateDotsC(val) {
  for (var i = 0; i < 4; i++) {
    var el = document.getElementById('tcd'+i+'c');
    if (!el) continue;
    if (i < val.length) { el.textContent = '●'; el.classList.add('filled'); }
    else { el.textContent = '·'; el.classList.remove('filled'); }
  }
}

async function tfVerify() {
  if (tfCurPin.length < 4) { document.getElementById('tfErr').textContent = 'Enter 4 digits'; return; }
  var btn = document.getElementById('tfVerifyBtn');
  btn.textContent = '...'; btn.disabled = true;
  btn.style.background = ''; btn.style.color = '';
  document.getElementById('tfErr').textContent = '';
  try {
    var r = await fetch(API_ORIGIN + '/voucher/' + VOUCHER_ID + '/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: tfCurPin })
    });
    var d = await r.json();
    if (!r.ok || d.error) {
      // Red — wrong PIN
      btn.textContent = 'Incorrect PIN — try again';
      btn.style.background = 'var(--red)'; btn.style.color = '#fff';
      btn.disabled = false;
      document.getElementById('tfErr').textContent = d.error || 'Incorrect PIN';
      tfCurPin = ''; updateDots('tcd', '');
      return;
    }
    // Correct PIN — show green for 2 seconds then switch to step 2
    btn.textContent = 'PIN Verified ✓';
    btn.style.background = '#00cc55'; btn.style.color = '#000';
    setTimeout(function() {
      document.getElementById('tfStep1').style.display = 'none';
      document.getElementById('tfStep2').style.display = 'block';
    }, 2000);
  } catch(e) {
    btn.textContent = 'Verify PIN'; btn.style.background = ''; btn.style.color = '';
    btn.disabled = false;
    document.getElementById('tfErr').textContent = 'Network error — try again';
  }
}

async function tfSubmit() {
  // Guard: PINs must match
  if (tfNewPin !== tfCfmPin) {
    document.getElementById('tfCfmErr').textContent = 'PINs do not match — re-enter confirm PIN';
    tfCfmPin = ''; updateDotsC('');
    document.getElementById('tfSubmitBtn').disabled = true;
    return;
  }
  var btn = document.getElementById('tfSubmitBtn');
  btn.textContent = '...'; btn.disabled = true;
  btn.style.background = ''; btn.style.color = '';
  document.getElementById('tfCfmErr').textContent = '';
  try {
    var r = await fetch(API_ORIGIN + '/voucher/' + VOUCHER_ID + '/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPin: tfCurPin, newPin: tfNewPin })
    });
    var d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'Transfer failed');
    // Success — build success HTML as a string then set on overlay directly
    var savedPin = tfNewPin;
    var overlay = document.getElementById('overlayTransfer');
    overlay.innerHTML =
      '<div class="modal" onclick="event.stopPropagation()" style="text-align:center">' +
        '<div style="font-size:56px;margin-bottom:8px">&#10003;</div>' +
        '<div style="color:#00cc55;font-size:20px;font-weight:700;margin-bottom:4px">Transfer Registered</div>' +
        '<div style="color:#555;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin-bottom:24px">New PIN is now active</div>' +
        '<div style="background:#0a0a00;border:2px solid #FFD000;border-radius:14px;padding:24px;margin-bottom:20px">' +
          '<div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#666;margin-bottom:12px">Your New PIN</div>' +
          '<div style="font-family:monospace;font-size:52px;font-weight:700;color:#FFD000;letter-spacing:14px;line-height:1">' + savedPin + '</div>' +
          '<div style="font-size:12px;color:#666;margin-top:14px;line-height:1.6">Write this on the back of the voucher<br>and cross out the old PIN</div>' +
        '</div>' +
        '<div style="background:#0d0d0d;border:1px solid #222;border-radius:10px;padding:12px;margin-bottom:24px;font-size:12px;color:#555;line-height:1.6;text-align:left">' +
          'This PIN is not stored anywhere. If lost, the voucher cannot be transferred or redeemed.' +
        '</div>' +
        '<button onclick="closeAll()" style="width:100%;height:52px;border-radius:12px;border:none;background:#FFD000;color:#0a0a0a;font-size:17px;font-weight:900;cursor:pointer">' +
          'Done - I have written it down' +
        '</button>' +
      '</div>';
  } catch(e) {
    btn.textContent = 'Transfer Failed';
    btn.style.background = 'var(--red)'; btn.style.color = '#fff';
    btn.disabled = false;
    // Show error — use alert as fallback so it's always visible on Android
    var errMsg = e.message || 'Unknown error';
    var errEl = document.getElementById('tfCfmErr');
    if (errEl) { errEl.textContent = errMsg; }
    // Also show in modal title area so it cannot be missed
    var modal = document.querySelector('#overlayTransfer .modal');
    if (modal) {
      var errDiv = document.getElementById('tfSubmitErrBanner');
      if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = 'tfSubmitErrBanner';
        errDiv.style.cssText = 'background:var(--red);color:#fff;padding:10px;border-radius:8px;font-size:13px;margin-bottom:10px;text-align:center';
        modal.insertBefore(errDiv, modal.firstChild);
      }
      errDiv.textContent = 'Error: ' + errMsg;
    }
  }
}

// ── Redeem flow state
var rdPin = '';
var rdAttempts = ${v.redeemAttempts || 0};
var rdMax = 3;

function rdKey(d) {
  if (rdPin.length >= 4) return;
  rdPin += d;
  updateDots('rd', rdPin);
  document.getElementById('rdErr').textContent = '';
  document.getElementById('rdSubmitBtn').disabled = rdPin.length < 4;
}
function rdDel() {
  rdPin = rdPin.slice(0, -1);
  updateDots('rd', rdPin);
  document.getElementById('rdSubmitBtn').disabled = true;
}

function updateAttemptsDisplay() {
  var left = Math.max(0, rdMax - rdAttempts);
  document.getElementById('attemptsLeft').textContent = left;
}

async function rdSubmit() {
  if (rdPin.length < 4) return;
  var btn = document.getElementById('rdSubmitBtn');
  btn.textContent = '…'; btn.disabled = true;
  try {
    var r = await fetch(API_ORIGIN + '/voucher/' + VOUCHER_ID + '/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: rdPin })
    });
    var d = await r.json();
    if (!r.ok || d.error) {
      rdAttempts++;
      updateAttemptsDisplay();
      if (d.locked) {
        document.getElementById('rdErr').textContent = 'Too many attempts. Try again in 24 hours.';
        btn.disabled = true;
        return;
      }
      document.getElementById('rdErr').textContent = d.error || 'Incorrect PIN';
      rdPin = '';
      updateDots('rd', rdPin);
      btn.textContent = 'Reveal QR Code';
      if (rdAttempts < rdMax) btn.disabled = false;
      return;
    }
    // Success — generate QR as data URL then build download UI
    var lnurl = d.lnurl;
    QRCode.toDataURL(lnurl, { width: 280, margin: 2, color: { dark: '#000000', light: '#ffffff' } }, function(err, dataUrl) {
      var step2 = document.getElementById('rdStep2');
      if (err) {
        step2.innerHTML = '<div style="color:#f44;text-align:center;padding:20px">QR generation failed</div>';
        document.getElementById('rdStep1').style.display = 'none';
        step2.style.display = 'block';
        return;
      }
      // Build the full redemption screen
      step2.innerHTML =
        '<div style="text-align:center">' +
          '<div style="color:#00cc55;font-size:18px;font-weight:700;margin-bottom:4px">&#9889; Redemption QR</div>' +
          '<div style="background:#1a0800;border:1px solid #ff8800;border-radius:10px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#ff8800;line-height:1.5">' +
            '&#9888; This QR is shown <strong>once only</strong>.<br>Save it now before closing.' +
          '</div>' +
          '<img src="' + dataUrl + '" style="width:240px;height:240px;border-radius:8px;display:block;margin:0 auto 16px" />' +
          '<a id="rdDownloadBtn" href="' + dataUrl + '" download="' + VOUCHER_ID + '.png" style="display:block;width:100%;height:52px;line-height:52px;border-radius:12px;border:none;background:#FFD000;color:#0a0a0a;font-size:17px;font-weight:900;letter-spacing:1px;text-transform:uppercase;text-decoration:none;margin-bottom:10px">&#8681; Save QR to Device</a>' +
          '<div style="font-size:11px;color:#555;margin-bottom:14px;line-height:1.5">Tap Save, then open the image in your Lightning wallet to redeem</div>' +
          '<button onclick="closeAll()" style="width:100%;height:46px;border-radius:12px;border:1px solid #333;background:none;color:#888;font-size:15px;font-weight:700;cursor:pointer">Done</button>' +
        '</div>';
      document.getElementById('rdStep1').style.display = 'none';
      step2.style.display = 'block';
    });
  } catch(e) {
    document.getElementById('rdErr').textContent = 'Network error — try again';
    btn.textContent = 'Reveal QR Code'; btn.disabled = false;
  }
}

// ── Modal open/close
function pinDots(prefix, val) {
  var h = '<div class="pin-row">';
  for (var i = 0; i < 4; i++) {
    h += '<div class="pin-dot" id="' + prefix + i + '">' + (i < val.length ? '&#9679;' : '&middot;') + '</div>';
  }
  return h + '</div>';
}

function buildKeypad(fn) {
  // Use numeric index into a lookup to avoid any quoting issues in onclick
  // kh[fn] maps fn name to the key handler functions
  var rows = [
    [1,2,3],[4,5,6],[7,8,9],['',0,'del']
  ];
  var q = "'" + fn + "'";
  var h = '<div class="pkb-grid">';
  for (var r = 0; r < rows.length; r++) {
    for (var c = 0; c < rows[r].length; c++) {
      var k = rows[r][c];
      if (k === '') {
        h += '<button class="pkb kdot" style="visibility:hidden"></button>';
      } else if (k === 'del') {
        h += '<button class="pkb pkb-del" onclick="kpDel(' + q + ')">&#9003;</button>';
      } else {
        h += '<button class="pkb" onclick="kpKey(' + q + ',' + k + ')">' + k + '</button>';
      }
    }
  }
  return h + '</div>';
}

function kpKey(fn, k) {
  var d = String(k);
  if (fn === 'tf') tfKey(d);
  else if (fn === 'tn') tnKey(d);
  else if (fn === 'tc') tcKey(d);
  else if (fn === 'rd') rdKey(d);
}
function kpDel(fn) {
  if (fn === 'tf') tfDel();
  else if (fn === 'tn') tnDel();
  else if (fn === 'tc') tcDel();
  else if (fn === 'rd') rdDel();
}

function openTransfer() {
  tfCurPin = ''; tfNewPin = ''; tfCfmPin = '';
  var modal = document.querySelector('#overlayTransfer .modal');
  modal.innerHTML =
    '<div id="tfStep1">' +
      '<div class="modal-title">Transfer Voucher</div>' +
      '<div class="modal-sub">Enter your current PIN to proceed</div>' +
      '<div style="font-size:11px;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Current PIN</div>' +
      pinDots('tcd', '') +
      buildKeypad('tf') +
      '<div class="err" id="tfErr"></div>' +
      '<button class="btn-modal btn-confirm" id="tfVerifyBtn" onclick="tfVerify()">Verify PIN</button>' +
      '<button class="btn-modal btn-cancel" onclick="closeAll()">Cancel</button>' +
    '</div>' +
    '<div id="tfStep2" style="display:none">' +
      '<div style="font-size:11px;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">New PIN</div>' +
      pinDots('tnd', '') +
      buildKeypad('tn') +
      '<div class="err" id="tfNewErr"></div>' +
      '<button class="btn-modal btn-cancel" onclick="closeAll()">Cancel</button>' +
    '</div>' +
    '<div id="tfStep2Confirm" style="display:none">' +
      '<div style="font-size:11px;color:#555;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px">New PIN</div>' +
      '<div id="tfNewPinSummary" class="pin-row" style="margin-bottom:16px"></div>' +
      '<div style="font-size:11px;color:#555;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Confirm new PIN</div>' +
      '<div class="pin-row"><div class="pin-dot" id="tcd0c">&middot;</div><div class="pin-dot" id="tcd1c">&middot;</div><div class="pin-dot" id="tcd2c">&middot;</div><div class="pin-dot" id="tcd3c">&middot;</div></div>' +
      buildKeypad('tc') +
      '<div class="err" id="tfCfmErr"></div>' +
      '<button class="btn-modal btn-confirm" id="tfSubmitBtn" onclick="tfSubmit()" disabled>Confirm Transfer</button>' +
      '<button class="btn-modal btn-cancel" style="color:#fff;border-color:#444" onclick="closeAll()">Cancel</button>' +
    '</div>';
  modal.scrollTop = 0;
  document.getElementById('overlayTransfer').style.display = 'flex';
}
function openRedeem() {
  rdPin = '';
  updateDots('rd', rdPin);
  updateAttemptsDisplay();
  document.getElementById('rdStep1').style.display = 'block';
  document.getElementById('rdStep2').style.display = 'none';
  document.getElementById('rdErr').textContent = '';
  document.getElementById('rdSubmitBtn').disabled = true;
  document.getElementById('overlayRedeem').style.display = 'flex';
}
function closeAll() {
  document.getElementById('overlayTransfer').style.display = 'none';
  document.getElementById('overlayRedeem').style.display = 'none';
}
function closeModals(e, overlay) {
  if (e.target === overlay) closeAll();
}
<\/script>
</body>
</html>`;
}





// ============================================================
// SATSCASH — Web screens
// /app/satscash       — hub
// /app/satscash/mint  — colour select + NFC tap + NDEF write
// /app/satscash/redeem — NFC tap + confirm + LNURL QR
// ============================================================

// Denomination map — single source of truth
const SC_DENOMS = {
  red:   5000,
  blue:  10000,
  green: 50000,
  gold:  100000,
  black: 500000
};

const SC_COLORS = {
  red:   '#e53935',
  blue:  '#1e88e5',
  green: '#43a047',
  gold:  '#FFD000',
  black: '#333333'
};

const SC_LABELS = {
  red:   'Red',
  blue:  'Blue',
  green: 'Green',
  gold:  'Gold',
  black: 'Black'
};

// ── SATSCASH HUB ──────────────────────────────────────────────

const SC_HUB = page('SatsCASH', `
<div class="app">
  <div class="hdr">
    <button class="back" onclick="go('/app')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD000" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      Back
    </button>
    <div id="logo"></div>
    <div style="width:60px"></div>
  </div>
  <div class="scroll" style="display:flex;flex-direction:column;gap:12px;padding-top:20px">

    <div style="text-align:center;margin-bottom:8px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:28px;color:var(--gold);letter-spacing:1px">SatsCASH</div>
      <div style="font-size:12px;color:var(--mut);margin-top:4px">NFC coin management</div>
    </div>

    <button class="btn-p" onclick="go('/app/satscash/mint')" style="height:64px;font-size:20px">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="margin-right:10px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
      Mint Coin
    </button>

    <button class="btn-p" onclick="go('/app/satscash/redeem')" style="height:64px;font-size:20px;background:var(--sur);color:var(--gold);border:1px solid var(--gold)">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="margin-right:10px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      Redeem Coin
    </button>

    <div class="card" style="margin-top:8px">
      <div class="slabel">Denominations</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--bdr2)">
          <div style="display:flex;align-items:center;gap:10px"><div style="width:14px;height:14px;border-radius:50%;background:#e53935;flex-shrink:0"></div><span style="color:#ccc;font-size:13px">Red</span></div>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold)">5,000 sats</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--bdr2)">
          <div style="display:flex;align-items:center;gap:10px"><div style="width:14px;height:14px;border-radius:50%;background:#1e88e5;flex-shrink:0"></div><span style="color:#ccc;font-size:13px">Blue</span></div>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold)">10,000 sats</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--bdr2)">
          <div style="display:flex;align-items:center;gap:10px"><div style="width:14px;height:14px;border-radius:50%;background:#43a047;flex-shrink:0"></div><span style="color:#ccc;font-size:13px">Green</span></div>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold)">50,000 sats</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--bdr2)">
          <div style="display:flex;align-items:center;gap:10px"><div style="width:14px;height:14px;border-radius:50%;background:#FFD000;flex-shrink:0"></div><span style="color:#ccc;font-size:13px">Gold</span></div>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold)">100,000 sats</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
          <div style="display:flex;align-items:center;gap:10px"><div style="width:14px;height:14px;border-radius:50%;background:#333;border:1px solid #555;flex-shrink:0"></div><span style="color:#ccc;font-size:13px">Black</span></div>
          <span style="font-family:'DM Mono',monospace;font-size:13px;color:var(--gold)">500,000 sats</span>
        </div>
      </div>
    </div>
    <div style="height:16px"></div>
  </div>
</div>
<script>
document.getElementById('logo').innerHTML=logoHTML();
<\/script>
`);

// ── SATSCASH MINT ─────────────────────────────────────────────

const SC_MINT = page('Mint SatsCASH', `
<div class="app">
  <div class="hdr">
    <button class="back" onclick="go('/app/satscash')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD000" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      Back
    </button>
    <div id="logo"></div>
    <div style="width:60px"></div>
  </div>
  <div class="scroll">
    <div id="stepSelect">
      <div class="slabel" style="margin-bottom:12px">Select denomination</div>
      <div style="display:flex;flex-direction:column;gap:10px" id="denomBtns"></div>
    </div>

    <div id="stepTap" style="display:none;text-align:center;padding:20px 0">
      <div id="tapColourDot" style="width:80px;height:80px;border-radius:50%;margin:0 auto 16px;border:3px solid #333"></div>
      <div id="tapLabel" style="font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:900;color:var(--gold);margin-bottom:4px"></div>
      <div id="tapSats" style="font-family:'DM Mono',monospace;font-size:16px;color:#888;margin-bottom:24px"></div>
      <div id="tapStatus" style="font-size:14px;color:var(--mut);margin-bottom:20px">Tap coin to Sunmi NFC reader...</div>
      <div id="tapSpinner" style="display:flex;justify-content:center;margin-bottom:20px"><div class="spin"></div></div>
      <button class="btn-s" onclick="cancelMint()">Cancel</button>
    </div>

    <div id="stepDone" style="display:none;text-align:center;padding:20px 0">
      <div style="font-size:56px;margin-bottom:12px">&#10003;</div>
      <div style="color:var(--grn);font-size:20px;font-weight:700;margin-bottom:8px">Coin Minted</div>
      <div id="doneLabel" style="font-family:'Barlow Condensed',sans-serif;font-size:24px;color:var(--gold);margin-bottom:4px"></div>
      <div id="doneSats" style="font-family:'DM Mono',monospace;font-size:14px;color:#888;margin-bottom:24px"></div>
      <div id="doneUid" style="font-family:'DM Mono',monospace;font-size:11px;color:#444;margin-bottom:24px"></div>
      <button class="btn-p" onclick="mintAnother()">Mint Another</button>
      <button class="btn-s" onclick="go('/app/satscash')">Done</button>
    </div>

    <div id="stepErr" style="display:none;text-align:center;padding:20px 0">
      <div style="font-size:48px;margin-bottom:12px">&#9888;</div>
      <div style="color:var(--red);font-size:18px;font-weight:700;margin-bottom:8px">Mint Failed</div>
      <div id="errMsg" style="color:#888;font-size:13px;margin-bottom:24px"></div>
      <button class="btn-p" onclick="resetMint()">Try Again</button>
      <button class="btn-s" onclick="go('/app/satscash')">Cancel</button>
    </div>
  </div>
</div>
<script>
document.getElementById('logo').innerHTML=logoHTML();

var DENOMS = {red:5000,blue:10000,green:50000,gold:100000,black:500000};
var DCOLORS = {red:'#e53935',blue:'#1e88e5',green:'#43a047',gold:'#FFD000',black:'#333333'};
var DLABELS = {red:'Red — 5,000 sats',blue:'Blue — 10,000 sats',green:'Green — 50,000 sats',gold:'Gold — 100,000 sats',black:'Black — 500,000 sats'};
var selectedColour = null;
var polling = false;

// Build denomination buttons
var container = document.getElementById('denomBtns');
Object.keys(DENOMS).forEach(function(colour) {
  var btn = document.createElement('button');
  btn.style.cssText = 'width:100%;padding:16px;border-radius:14px;border:2px solid #222;background:var(--sur);display:flex;align-items:center;gap:14px;cursor:pointer;text-align:left';
  btn.innerHTML =
    '<div style="width:36px;height:36px;border-radius:50%;background:' + DCOLORS[colour] + ';flex-shrink:0' + (colour==='black'?';border:1px solid #555':'') + '"></div>' +
    '<div>' +
      '<div style="color:#fff;font-size:16px;font-weight:700">' + DLABELS[colour] + '</div>' +
    '</div>';
  btn.addEventListener('click', function() { selectColour(colour); });
  container.appendChild(btn);
});

function selectColour(colour) {
  selectedColour = colour;
  document.getElementById('stepSelect').style.display = 'none';
  document.getElementById('tapColourDot').style.background = DCOLORS[colour];
  document.getElementById('tapColourDot').style.borderColor = DCOLORS[colour];
  document.getElementById('tapLabel').textContent = DLABELS[colour];
  document.getElementById('tapSats').textContent = DENOMS[colour].toLocaleString() + ' sats';
  document.getElementById('stepTap').style.display = 'block';
  startPolling();
}

async function startPolling() {
  polling = true;
  document.getElementById('tapStatus').textContent = 'Tap coin to Sunmi NFC reader...';
  try {
    var r = await fetch('http://localhost:8765/nfc/poll', {signal: AbortSignal.timeout(11000)});
    if (!r.ok) throw new Error('NFC poll failed');
    var d = await r.json();
    if (!d.uid) throw new Error('No UID returned');
    if (!polling) return;
    await doMint(d.uid);
  } catch(e) {
    if (!polling) return;
    if (e.name === 'TimeoutError' || e.message.includes('timeout')) {
      // Auto retry
      if (polling) startPolling();
    } else {
      showErr('NFC error: ' + e.message);
    }
  }
}

async function doMint(uid) {
  polling = false;
  document.getElementById('tapStatus').textContent = 'Keep coin on reader — minting...';
  try {
    // 1. Create KV record
    var r = await fetch('/satscash/mint', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({uid: uid, colour: selectedColour})
    });
    var d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'Mint failed');

    // 2. Write NDEF URI to coin
    // PrintServer expects: { uid, payload }
    // uid must match tag in queue (coin must stay on reader)
    // payload is written as URI record by NfcManager — auto-opens browser on tap
    document.getElementById('tapStatus').textContent = 'Keep coin on reader — writing...';
    var ndefUrl = window.location.origin + '/c/' + uid;
    var wr = await fetch('http://localhost:8765/nfc/write', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({uid: uid, payload: ndefUrl})
    });
    var wrData = await wr.json();
    if (!wr.ok || !wrData.ok) {
      throw new Error('NDEF write failed: ' + (wrData.reason || wrData.error || 'unknown') + ' — coin is minted in KV but tap-to-open not written');
    }

    // 3. Success — coin can be lifted now
    document.getElementById('tapStatus').textContent = 'Done — you can lift the coin';
    document.getElementById('stepTap').style.display = 'none';
    document.getElementById('doneLabel').textContent = DLABELS[selectedColour];
    document.getElementById('doneSats').textContent = DENOMS[selectedColour].toLocaleString() + ' sats';
    document.getElementById('doneUid').textContent = 'UID: ' + uid;
    document.getElementById('stepDone').style.display = 'block';
  } catch(e) {
    showErr(e.message);
  }
}

function showErr(msg) {
  polling = false;
  document.getElementById('stepTap').style.display = 'none';
  document.getElementById('errMsg').textContent = msg;
  document.getElementById('stepErr').style.display = 'block';
}

function cancelMint() {
  polling = false;
  go('/app/satscash');
}

function mintAnother() {
  selectedColour = null;
  polling = false;
  document.getElementById('stepDone').style.display = 'none';
  document.getElementById('stepSelect').style.display = 'block';
}

function resetMint() {
  document.getElementById('stepErr').style.display = 'none';
  if (selectedColour) {
    document.getElementById('stepTap').style.display = 'block';
    startPolling();
  } else {
    document.getElementById('stepSelect').style.display = 'block';
  }
}
<\/script>
`);

// ── SATSCASH REDEEM ───────────────────────────────────────────

const SC_REDEEM = page('Redeem SatsCASH', `
<div class="app">
  <div class="hdr">
    <button class="back" onclick="go('/app/satscash')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD000" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      Back
    </button>
    <div id="logo"></div>
    <div style="width:60px"></div>
  </div>
  <div class="scroll">

    <div id="stepTap" style="text-align:center;padding:20px 0">
      <div style="font-size:48px;margin-bottom:16px">&#x1F4B4;</div>
      <div style="font-size:16px;color:var(--txt);font-weight:600;margin-bottom:8px">Tap coin to reader</div>
      <div style="font-size:13px;color:var(--mut);margin-bottom:24px">Hold the coin against the Sunmi NFC reader</div>
      <div style="display:flex;justify-content:center;margin-bottom:20px"><div class="spin"></div></div>
      <div id="tapMsg" style="font-size:13px;color:var(--mut);margin-bottom:20px"></div>
    </div>

    <div id="stepConfirm" style="display:none">
      <div style="text-align:center;margin-bottom:16px">
        <div id="coinDot" style="width:64px;height:64px;border-radius:50%;margin:0 auto 12px;border:3px solid #333"></div>
        <div id="coinLabel" style="font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:900;color:#ccc"></div>
      </div>
      <div class="card" style="text-align:center">
        <div id="coinSats" style="font-size:48px;font-weight:200;color:var(--gold);line-height:1;margin-bottom:4px"></div>
        <div style="font-size:14px;color:var(--mut);margin-bottom:4px">SATS</div>
        <div id="coinFiat" style="font-size:16px;color:#888;font-family:'DM Mono',monospace"></div>
      </div>
      <div class="card">
        <div class="row"><span class="lbl">UID</span><span id="coinUid" class="val" style="font-size:11px"></span></div>
        <div class="row"><span class="lbl">Status</span><span id="coinStatus" class="val"></span></div>
        <div class="row"><span class="lbl">Mint count</span><span id="coinMintCount" class="val"></span></div>
      </div>
      <button class="btn-p" id="confirmBtn" onclick="confirmRedeem()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="margin-right:8px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        Confirm Redemption
      </button>
      <button class="btn-s" onclick="resetRedeem()">Scan Different Coin</button>
    </div>

    <div id="stepQR" style="display:none;text-align:center;padding:16px 0">
      <div style="color:var(--grn);font-size:18px;font-weight:700;margin-bottom:4px">&#9889; Scan to Redeem</div>
      <div style="color:var(--mut);font-size:12px;margin-bottom:16px">Present terminal to holder — they scan with Lightning wallet</div>
      <div id="qrWrap" style="background:#f8f8f8;border-radius:12px;padding:12px;display:inline-block;margin-bottom:16px">
        <div class="spin" style="border-top-color:#333;border-color:#ddd;margin:60px auto"></div>
      </div>
      <div id="qrSats" style="font-family:'DM Mono',monospace;font-size:16px;color:var(--gold);margin-bottom:4px"></div>
      <div id="qrFiat" style="font-size:12px;color:var(--mut);margin-bottom:20px"></div>
      <button class="btn-s" onclick="go('/app/satscash')">Done</button>
    </div>

    <div id="stepErr" style="display:none;text-align:center;padding:20px 0">
      <div style="font-size:48px;margin-bottom:12px">&#9888;</div>
      <div style="color:var(--red);font-size:18px;font-weight:700;margin-bottom:8px">Error</div>
      <div id="redeemErr" style="color:#888;font-size:13px;margin-bottom:24px"></div>
      <button class="btn-p" onclick="resetRedeem()">Try Again</button>
      <button class="btn-s" onclick="go('/app/satscash')">Cancel</button>
    </div>

  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"><\/script>
<script>
document.getElementById('logo').innerHTML=logoHTML();
var DCOLORS = {red:'#e53935',blue:'#1e88e5',green:'#43a047',gold:'#FFD000',black:'#333333'};
var currentUid = null;
var btcPrice = null;
var S = getSettings();

getBtcPrice(S).then(function(p){ btcPrice = p; }).catch(function(){});

startTap();

async function startTap() {
  document.getElementById('stepTap').style.display = 'block';
  document.getElementById('stepConfirm').style.display = 'none';
  document.getElementById('stepQR').style.display = 'none';
  document.getElementById('stepErr').style.display = 'none';
  document.getElementById('tapMsg').textContent = '';
  pollNfc();
}

async function pollNfc() {
  try {
    var r = await fetch('http://localhost:8765/nfc/poll', {signal: AbortSignal.timeout(11000)});
    if (!r.ok) throw new Error('NFC poll failed');
    var d = await r.json();
    if (!d.uid) throw new Error('No UID returned');
    await lookupCoin(d.uid);
  } catch(e) {
    if (e.name === 'TimeoutError' || e.message.includes('timeout')) {
      pollNfc(); // keep polling
    } else {
      document.getElementById('tapMsg').textContent = 'NFC error: ' + e.message + ' — retrying...';
      setTimeout(pollNfc, 2000);
    }
  }
}

async function lookupCoin(uid) {
  try {
    var r = await fetch('/satscash/' + encodeURIComponent(uid));
    var d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'Coin not recognised');

    currentUid = uid;
    document.getElementById('stepTap').style.display = 'none';

    // Populate confirm screen
    var col = d.colour || 'red';
    document.getElementById('coinDot').style.background = DCOLORS[col] || '#888';
    document.getElementById('coinDot').style.borderColor = DCOLORS[col] || '#888';
    document.getElementById('coinLabel').textContent = (col.charAt(0).toUpperCase()+col.slice(1)) + ' Coin';
    document.getElementById('coinSats').textContent = Number(d.sats).toLocaleString();
    document.getElementById('coinUid').textContent = uid;
    document.getElementById('coinStatus').textContent = d.status.charAt(0).toUpperCase()+d.status.slice(1);
    document.getElementById('coinMintCount').textContent = d.mintCount || 1;

    var sym = S.currencySymbol || '\u20ac';
    if (btcPrice) {
      var fiatVal = ((d.sats / 100000000) * btcPrice).toFixed(2);
      document.getElementById('coinFiat').textContent = '\u2248 ' + sym + fiatVal + ' today';
    }

    if (d.status !== 'active') {
      document.getElementById('confirmBtn').disabled = true;
      document.getElementById('confirmBtn').textContent = 'Coin is ' + d.status;
    }

    document.getElementById('stepConfirm').style.display = 'block';
  } catch(e) {
    document.getElementById('tapMsg').textContent = e.message;
    setTimeout(function(){ pollNfc(); }, 2000);
  }
}

async function confirmRedeem() {
  var btn = document.getElementById('confirmBtn');
  btn.innerHTML = '<div class="spin" style="border-top-color:#000;border-color:rgba(0,0,0,.2);width:18px;height:18px;border-width:2px"></div>';
  btn.disabled = true;
  try {
    var r = await fetch('/satscash/redeem', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({uid: currentUid})
    });
    var d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || 'Redemption failed');

    // Show QR
    document.getElementById('stepConfirm').style.display = 'none';
    document.getElementById('stepQR').style.display = 'block';
    document.getElementById('qrSats').textContent = Number(d.sats).toLocaleString() + ' sats';
    var sym = S.currencySymbol || '\u20ac';
    if (btcPrice) {
      document.getElementById('qrFiat').textContent = '\u2248 ' + sym + ((d.sats/100000000)*btcPrice).toFixed(2);
    }

    QRCode.toCanvas(d.lnurl, {width:240,margin:2,color:{dark:'#000',light:'#fff'}}, function(err, canvas) {
      var wrap = document.getElementById('qrWrap');
      if (err) { wrap.innerHTML = '<div style="color:#f44;padding:20px">QR error</div>'; return; }
      canvas.style.borderRadius = '8px';
      wrap.innerHTML = '';
      wrap.appendChild(canvas);
    });
  } catch(e) {
    document.getElementById('stepConfirm').style.display = 'none';
    document.getElementById('redeemErr').textContent = e.message;
    document.getElementById('stepErr').style.display = 'block';
  }
}

function resetRedeem() {
  currentUid = null;
  startTap();
}
<\/script>
`);

// ============================================================
// DEMO — GET /demo
// Empty sale screen, Demo badge, Print Voucher disabled
// No API calls, no history, no settings navigation
// ============================================================

const DEMO = page('Demo — SatsVoucher', `
<div class="app">
  <div class="hdr">
    <div id="logo"></div>
    <div style="display:flex;align-items:center;gap:8px">
      <span style="padding:3px 10px;border-radius:6px;background:#1a1a00;border:1px solid #3a3a00;color:#888;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Demo</span>
    </div>
  </div>

  <div style="padding:12px 16px 0;flex-shrink:0">
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:2px;
      padding-bottom:8px;border-bottom:1px solid var(--bdr)">
      <span id="sym" style="font-weight:300;font-size:28px;color:var(--gold);line-height:1;padding-bottom:7px">&#8364;</span>
      <span id="whole" style="font-weight:200;font-size:60px;color:var(--txt);letter-spacing:-2px;line-height:1;font-variant-numeric:tabular-nums">0</span>
      <span id="cents" style="font-weight:200;font-size:60px;color:#555;letter-spacing:-2px;line-height:1;font-variant-numeric:tabular-nums">.00</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:center;gap:5px;height:30px">
      <div style="width:5px;height:5px;border-radius:50%;background:var(--grn);flex-shrink:0;animation:pulse 2s ease-in-out infinite"></div>
      <span id="bval" class="mono" style="font-size:12px;color:#888">0.00000000 BTC</span>
      <span id="brate" class="mono" style="font-size:10px;color:#3a3a3a"></span>
    </div>
  </div>

  <div style="flex:1;padding:4px 12px 8px;display:flex;flex-direction:column;gap:5px;min-height:0">
    <div style="display:flex;justify-content:space-between;padding:0 2px">
      <span id="minlbl" class="mono" style="font-size:10px;color:#333">MIN &#8364;1.00</span>
      <span id="maxlbl" class="mono" style="font-size:10px;color:#333">MAX &#8364;500.00</span>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(4,1fr);gap:6px;flex:1;min-height:0">
      <button class="kbtn" id="k1">1</button>
      <button class="kbtn" id="k2">2</button>
      <button class="kbtn" id="k3">3</button>
      <button class="kbtn" id="k4">4</button>
      <button class="kbtn" id="k5">5</button>
      <button class="kbtn" id="k6">6</button>
      <button class="kbtn" id="k7">7</button>
      <button class="kbtn" id="k8">8</button>
      <button class="kbtn" id="k9">9</button>
      <button class="kbtn kdot" id="kdot">&#183;</button>
      <button class="kbtn" id="k0">0</button>
      <button class="kbtn kbs" id="kbs">&#9003;</button>
    </div>

    <button class="btn-p" disabled style="opacity:.35;cursor:not-allowed">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:7px;flex-shrink:0">
        <polyline points="6 9 6 2 18 2 18 9"/>
        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
        <rect x="6" y="14" width="12" height="8"/>
      </svg>
      Demo Mode
    </button>
  </div>
</div>

<script>
document.getElementById('logo').innerHTML=logoHTML();
var S=getSettings();
var sym=S.currencySymbol||'\u20ac';
document.getElementById('sym').textContent=sym;
document.getElementById('minlbl').textContent='MIN '+sym+parseFloat(S.minAmount||1).toFixed(2);
document.getElementById('maxlbl').textContent='MAX '+sym+parseFloat(S.maxAmount||500).toFixed(2);

// Live BTC price — read only, no voucher creation
getBtcPrice(S).then(function(p){
  document.getElementById('brate').textContent='@ '+sym+p.toLocaleString()+'/BTC';
}).catch(function(){
  document.getElementById('brate').textContent='price unavailable';
});

var digits='';
function amt(){
  if(!digits)return 0;
  var p=digits.length<3?('00'+digits).slice(-3):digits;
  return parseFloat(p.slice(0,-2)+'.'+p.slice(-2));
}
function render(){
  var a=amt();
  var w=Math.floor(a),c=(a-w).toFixed(2).slice(1);
  document.getElementById('whole').textContent=w;
  document.getElementById('cents').textContent=c;
  var col=a>S.maxAmount?'var(--red)':a>=S.minAmount?'#fff':'var(--txt)';
  document.getElementById('whole').style.color=col;
  document.getElementById('cents').style.color=a>S.maxAmount?'var(--red)':'#555';
}
function key(k){
  if(k==='bs'){digits=digits.slice(0,-1);}
  else if(k==='.'){/* implied */}
  else{if(digits.length>=8)return;digits=(digits+k).replace(/^0+/,'')||'';}
  render();
}
document.getElementById('k1').addEventListener('click',function(){key('1');});
document.getElementById('k2').addEventListener('click',function(){key('2');});
document.getElementById('k3').addEventListener('click',function(){key('3');});
document.getElementById('k4').addEventListener('click',function(){key('4');});
document.getElementById('k5').addEventListener('click',function(){key('5');});
document.getElementById('k6').addEventListener('click',function(){key('6');});
document.getElementById('k7').addEventListener('click',function(){key('7');});
document.getElementById('k8').addEventListener('click',function(){key('8');});
document.getElementById('k9').addEventListener('click',function(){key('9');});
document.getElementById('k0').addEventListener('click',function(){key('0');});
document.getElementById('kdot').addEventListener('click',function(){key('.');});
document.getElementById('kbs').addEventListener('click',function(){key('bs');});
document.addEventListener('keydown',function(e){
  if(e.key>='0'&&e.key<='9'){key(e.key);}
  if(e.key==='Backspace'){e.preventDefault();key('bs');}
});
<\/script>
`);

// ============================================================
// HOME PAGE — GET /
// Generic public landing page for SatsVoucher platform
// ============================================================

const HOMEPAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<meta name="description" content="SatsVoucher — A Bitcoin Lightning voucher platform for retail. Issue, transfer and redeem value instantly.">
<title>SatsVoucher</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Barlow:wght@300;400;600;800;900&family=Barlow+Condensed:wght@700;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --gold:#FFD000;--bg:#080808;--sur:#111111;--sur2:#141414;
  --bdr:#232323;--txt:#f0f0f0;--mut:#666;
  --red:#ff4444;--grn:#00cc55;
}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--txt);font-family:'Barlow',sans-serif;min-height:100vh;overflow-x:hidden}

/* ── NAV */
nav{
  position:sticky;top:0;z-index:100;
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 24px;border-bottom:1px solid var(--bdr);
  background:rgba(8,8,8,.92);backdrop-filter:blur(12px);
}
.nav-logo{display:flex;align-items:center;gap:10px}
.w-sats{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:20px;color:var(--gold);letter-spacing:.5px;text-transform:uppercase}
.w-vch{font-family:'Barlow Condensed',sans-serif;font-weight:300;font-size:20px;color:#fff;letter-spacing:3px;text-transform:uppercase}
.nav-links{display:flex;gap:6px}
.nav-link{
  padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;
  text-decoration:none;color:var(--mut);border:1px solid transparent;
  transition:all .15s;
}
.nav-link:hover{color:#fff;border-color:var(--bdr)}
.nav-link.primary{background:var(--gold);color:#0a0a0a;border-color:var(--gold)}
.nav-link.primary:hover{background:#e6bb00;border-color:#e6bb00}

/* ── HERO */
.hero{
  padding:80px 24px 60px;
  text-align:center;
  max-width:720px;margin:0 auto;
}
.hero-eyebrow{
  display:inline-block;
  font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
  color:var(--gold);border:1px solid rgba(255,208,0,.3);
  border-radius:20px;padding:4px 14px;margin-bottom:24px;
}
.hero h1{
  font-size:clamp(36px,7vw,64px);font-weight:800;line-height:1.05;
  margin-bottom:20px;letter-spacing:-1px;
}
.hero h1 em{color:var(--gold);font-style:normal}
.hero-sub{
  font-size:17px;font-weight:300;color:#888;line-height:1.7;
  max-width:540px;margin:0 auto 36px;
}
.hero-actions{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.btn{
  display:inline-flex;align-items:center;gap:8px;
  padding:13px 24px;border-radius:12px;font-size:15px;font-weight:700;
  text-decoration:none;transition:all .15s;border:1px solid transparent;
  font-family:'Barlow Condensed',sans-serif;letter-spacing:.5px;text-transform:uppercase;
}
.btn-gold{background:var(--gold);color:#0a0a0a;border-color:var(--gold)}
.btn-gold:hover{background:#e6bb00}
.btn-outline{background:none;color:#ccc;border-color:var(--bdr)}
.btn-outline:hover{border-color:#555;color:#fff}

/* ── STATS ROW */
.stats{
  display:flex;justify-content:center;gap:0;
  border-top:1px solid var(--bdr);border-bottom:1px solid var(--bdr);
  margin:0;
}
.stat{
  flex:1;max-width:200px;padding:28px 20px;text-align:center;
  border-right:1px solid var(--bdr);
}
.stat:last-child{border-right:none}
.stat-n{font-size:32px;font-weight:200;color:var(--gold);font-variant-numeric:tabular-nums}
.stat-l{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--mut);margin-top:4px}

/* ── HOW IT WORKS */
.section{padding:64px 24px;max-width:900px;margin:0 auto}
.section-label{
  font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;
  color:var(--gold);margin-bottom:12px;
}
.section h2{
  font-size:clamp(24px,4vw,36px);font-weight:800;margin-bottom:40px;
  letter-spacing:-.5px;
}

/* ── AUDIENCE TABS */
.tabs{display:flex;gap:0;border:1px solid var(--bdr);border-radius:12px;overflow:hidden;margin-bottom:32px;width:fit-content}
.tab{
  padding:10px 24px;font-size:13px;font-weight:700;cursor:pointer;
  background:none;border:none;color:var(--mut);transition:all .15s;
  font-family:'Barlow',sans-serif;
}
.tab.active{background:var(--sur2);color:#fff}

/* ── STEPS */
.steps{display:grid;grid-template-columns:1fr;gap:12px}
.step{
  display:flex;align-items:flex-start;gap:16px;
  background:var(--sur);border:1px solid var(--bdr);border-radius:14px;
  padding:20px;
}
.step-num{
  width:32px;height:32px;border-radius:50%;
  background:rgba(255,208,0,.1);border:1px solid rgba(255,208,0,.3);
  display:flex;align-items:center;justify-content:center;
  font-family:'DM Mono',monospace;font-size:13px;font-weight:700;color:var(--gold);
  flex-shrink:0;
}
.step-body h3{font-size:15px;font-weight:700;color:#fff;margin-bottom:4px}
.step-body p{font-size:13px;color:#888;line-height:1.6}
.step-body .note{
  display:inline-block;margin-top:8px;
  font-size:11px;color:var(--gold);
  background:rgba(255,208,0,.07);border:1px solid rgba(255,208,0,.15);
  border-radius:6px;padding:3px 9px;font-family:'DM Mono',monospace;
}

/* ── FLOW DIAGRAM */
.flow{
  display:flex;align-items:center;justify-content:center;
  gap:0;flex-wrap:wrap;margin:40px 0;
}
.flow-node{
  background:var(--sur);border:1px solid var(--bdr);border-radius:10px;
  padding:12px 18px;text-align:center;min-width:100px;
}
.flow-node-label{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--mut);margin-bottom:4px}
.flow-node-val{font-size:13px;font-weight:600;color:#fff}
.flow-arrow{color:#333;font-size:20px;padding:0 8px;align-self:center}

/* ── TECH SECTION */
.tech-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.tech-card{
  background:var(--sur);border:1px solid var(--bdr);border-radius:14px;
  padding:20px;
}
.tech-icon{font-size:24px;margin-bottom:10px}
.tech-card h3{font-size:14px;font-weight:700;color:#fff;margin-bottom:6px}
.tech-card p{font-size:12px;color:#888;line-height:1.6}

/* ── FOOTER */
footer{
  border-top:1px solid var(--bdr);padding:32px 24px;
  text-align:center;color:var(--mut);font-size:12px;
}
footer a{color:var(--mut);text-decoration:none}
footer a:hover{color:var(--gold)}
.footer-logo{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:16px}

/* ── RESPONSIVE */
@media(max-width:900px){
  .tech-grid{grid-template-columns:repeat(2,1fr)}
}
@media(max-width:600px){
  nav{padding:12px 16px}
  .nav-links .nav-link:not(.primary){display:none}
  .stats{flex-wrap:wrap}
  .stat{min-width:50%;border-right:none;border-bottom:1px solid var(--bdr)}
  .hero{padding:56px 16px 48px}
  .section{padding:48px 16px}
  .flow{gap:4px}
  .flow-arrow{font-size:14px;padding:0 2px}
  .tech-grid{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- ── NAV -->
<nav>
  <div class="nav-logo">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="30" height="30"><rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000"/><circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" stroke-width="12"/><polygon points="285,30 175,270 245,270 215,470 325,230 255,230" fill="#FFD000" stroke="#0D0D0D" stroke-width="10" stroke-linejoin="round"/></svg>
    <div style="display:flex;align-items:baseline;gap:5px">
      <span class="w-sats">Sats</span><span class="w-vch">VOUCHER</span>
    </div>
  </div>
  <div class="nav-links">
    <a class="nav-link" href="#how-it-works">How it works</a>
    <a class="nav-link" href="#technology">Technology</a>
    <a class="nav-link primary" href="/demo">Merchant App &#8599;</a>
  </div>
</nav>

<!-- ── HERO -->
<div class="hero">
  <div class="hero-eyebrow">&#9889; Bitcoin Lightning Vouchers</div>
  <h1>Issue. Transfer.<br><em>Redeem.</em></h1>
  <p class="hero-sub">
    SatsVoucher is a Bitcoin Lightning voucher platform for retail.
    Issue vouchers at point of sale, let customers transfer them freely,
    and redeem directly to any Lightning wallet — instantly, anywhere.
  </p>
  <div class="hero-actions">
    <a class="btn btn-gold" href="#merchant">Merchant guide &#8595;</a>
    <a class="btn btn-outline" href="#customer">Customer guide &#8595;</a>
  </div>
</div>

<!-- ── STATS -->
<div class="stats">
  <div class="stat">
    <div class="stat-n">90</div>
    <div class="stat-l">Day validity</div>
  </div>
  <div class="stat">
    <div class="stat-n">&#8364;500</div>
    <div class="stat-l">Max value</div>
  </div>
  <div class="stat">
    <div class="stat-n">&#9889;</div>
    <div class="stat-l">Lightning fast</div>
  </div>
  <div class="stat">
    <div class="stat-n">4</div>
    <div class="stat-l">Digit PIN security</div>
  </div>
</div>

<!-- ── HOW IT WORKS -->
<div class="section" id="how-it-works">
  <div class="section-label">How it works</div>
  <h2>Simple flow, secure by design</h2>

  <div class="flow">
    <div class="flow-node"><div class="flow-node-label">Issue</div><div class="flow-node-val">Merchant</div></div>
    <div class="flow-arrow">&#8594;</div>
    <div class="flow-node"><div class="flow-node-label">Voucher</div><div class="flow-node-val">Paper + PIN</div></div>
    <div class="flow-arrow">&#8594;</div>
    <div class="flow-node"><div class="flow-node-label">Transfer</div><div class="flow-node-val">Optional</div></div>
    <div class="flow-arrow">&#8594;</div>
    <div class="flow-node"><div class="flow-node-label">Redeem</div><div class="flow-node-val">Lightning</div></div>
    <div class="flow-arrow">&#8594;</div>
    <div class="flow-node"><div class="flow-node-label">Paid</div><div class="flow-node-val">Instantly</div></div>
  </div>
</div>

<!-- ── MERCHANT SECTION -->
<div class="section" id="merchant" style="padding-top:0">
  <div class="section-label">For merchants</div>
  <h2>Issuing a voucher</h2>
  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-body">
        <h3>Enter the amount</h3>
        <p>Open the SatsVoucher app on the point of sale terminal. Use the keypad to enter the voucher value in your local currency. The current Bitcoin exchange rate is shown live.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-body">
        <h3>Tap Print Voucher</h3>
        <p>Press the Print Voucher button. The system creates the voucher, converts the amount to Bitcoin, and generates a unique 4-digit security PIN. The confirm screen loads.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-body">
        <h3>Hand device to customer</h3>
        <p>Pass the terminal to the customer. They will see the voucher amount, a QR code, and their initial PIN displayed on screen. The PIN is never printed — only the customer sees it.</p>
        <span class="note">Security: PIN visible on screen only</span>
      </div>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <div class="step-body">
        <h3>Customer prints and writes PIN</h3>
        <p>The customer taps Print Receipt. The receipt prints with the QR code and voucher details. They write their PIN on the back of the receipt, then tap New Sale to return the terminal.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-num">5</div>
      <div class="step-body">
        <h3>Transaction complete</h3>
        <p>The voucher is now live. All issued vouchers appear in the History screen on the terminal with their current status — Active, Pending, Redeemed, or Expired.</p>
      </div>
    </div>
  </div>
</div>

<!-- ── CUSTOMER SECTION -->
<div class="section" id="customer" style="padding-top:0">
  <div class="section-label">For customers</div>
  <h2>Using your voucher</h2>
  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-body">
        <h3>Keep your receipt and PIN safe</h3>
        <p>Your voucher receipt has a QR code and your unique ID. You chose a 4-digit PIN when you received it — this is written on the back. Anyone with both the QR and the PIN can use this voucher.</p>
        <span class="note">Treat it like cash</span>
      </div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-body">
        <h3>Check your voucher anytime</h3>
        <p>Scan the QR code on your receipt with any phone camera. The verification page opens and shows your voucher status, amount, and expiry date — no app needed, no account required.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-body">
        <h3>Transfer to someone else (optional)</h3>
        <p>On the verification page, tap Transfer. Enter your current PIN, then set a new 4-digit PIN for the new holder. Write the new PIN on the back of the voucher and cross out the old one. The transfer is instant and permanent.</p>
        <span class="note">New holder sets their own PIN</span>
      </div>
    </div>
    <div class="step">
      <div class="step-num">4</div>
      <div class="step-body">
        <h3>Redeem to your Lightning wallet</h3>
        <p>On the verification page, tap Redeem. Enter your PIN. A QR code is revealed — this is your one-time Lightning redemption code. Save it to your device immediately using the Save button, then open it in any Lightning wallet to receive your Bitcoin.</p>
        <span class="note">Redemption QR is shown once only — save it before closing</span>
      </div>
    </div>
    <div class="step">
      <div class="step-num">5</div>
      <div class="step-body">
        <h3>Funds arrive instantly</h3>
        <p>Once your Lightning wallet processes the QR, the Bitcoin arrives in seconds. The voucher status updates to Redeemed. Vouchers expire 90 days after issue if not redeemed.</p>
      </div>
    </div>
  </div>
</div>

<!-- ── TECHNOLOGY -->
<div class="section" id="technology" style="padding-top:0">
  <div class="section-label">Technology</div>
  <h2>Built on open infrastructure</h2>
  <div class="tech-grid">
    <div class="tech-card">
      <div class="tech-icon">&#9889;</div>
      <h3>Bitcoin Lightning Network</h3>
      <p>Instant, low-fee Bitcoin payments. Vouchers redeem directly to any Lightning wallet worldwide.</p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">&#9729;</div>
      <h3>Cloudflare Workers</h3>
      <p>Serverless edge infrastructure. The entire platform runs in a single Worker — globally distributed, zero maintenance.</p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">&#128273;</div>
      <h3>PIN Security</h3>
      <p>4-digit PIN hashed with SHA-256 and a random salt. PINs are never stored in plain text. Transferable by design.</p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">&#128247;</div>
      <h3>No App Required</h3>
      <p>Customers verify and redeem using any phone camera. The verification page works in any mobile browser — no installation needed.</p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">&#128444;</div>
      <h3>Thermal Receipt</h3>
      <p>Issued on standard thermal paper with a QR code. Physical voucher as bearer instrument — simple, familiar, reliable.</p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">&#128200;</div>
      <h3>Real-time Monitoring</h3>
      <p>Live dashboard shows treasury balance, issued value, redemption rates, and system solvency at a glance.</p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">&#128241;</div>
      <h3>Sunmi V2S Bridge</h3>
      <p>A custom Android app runs silently on the Sunmi V2S point of sale terminal, exposing the built-in thermal printer via a local HTTP bridge. The merchant web app connects automatically when the terminal is present.</p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">&#128279;</div>
      <h3>Open Source</h3>
      <p>The entire SatsVoucher platform is open source. Any merchant with a Sunmi V2S POS terminal can download the code, deploy their own Worker, and be running in minutes.</p>
      <p style="margin-top:10px">
        <a href="https://github.com/blankworker1/SatsVOUCHER" target="_blank" rel="noopener"
           style="color:var(--gold);font-family:'DM Mono',monospace;font-size:12px;text-decoration:none;border-bottom:1px solid rgba(255,208,0,.3);padding-bottom:1px">
          GitHub &#8599;
        </a>
      </p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">
        <img src="https://blink.sv/favicon.ico" width="24" height="24" style="border-radius:6px;vertical-align:middle" onerror="this.style.display='none'">
      </div>
      <h3>Powered by Blink</h3>
      <p>SatsVoucher uses the Blink wallet and API for all Lightning payments. Blink is a battle-tested custodial Lightning wallet trusted by thousands of merchants and users worldwide.</p>
      <p style="margin-top:10px">
        <a href="https://blink.sv" target="_blank" rel="noopener"
           style="color:var(--gold);font-family:'DM Mono',monospace;font-size:12px;text-decoration:none;border-bottom:1px solid rgba(255,208,0,.3);padding-bottom:1px">
          blink.sv &#8599;
        </a>
      </p>
    </div>
    <div class="tech-card">
      <div class="tech-icon">&#127759;</div>
      <h3>What&#39;s Coming</h3>
      <p>SatsVoucher is the first step. The roadmap extends into physical Bitcoin cash — NFC-enabled coins, merchant network tools, and multi-location support. Every piece is designed to close the loop between earning, holding, and spending Bitcoin in the real world.</p>
      <p style="margin-top:10px;font-size:12px;color:var(--mut);font-style:italic">Building the infrastructure for circular Bitcoin economies — one merchant at a time.</p>
    </div>
  </div>
</div>


<!-- ── SUPPORT SECTION -->
<div class="section" id="support" style="padding-top:0;text-align:center">
  <div class="section-label">Support the project</div>
  <h2>Send sats</h2>
  <p style="color:#888;font-size:15px;font-weight:300;max-width:480px;margin:0 auto 32px;line-height:1.7">
    SatsVoucher is open source and free to use. If you find it useful,
    send a few sats to support ongoing development.
  </p>
  <a href="lightning:satsvoucher@blink.sv" style="display:inline-block;text-decoration:none">
    <div style="background:var(--sur);border:1px solid var(--bdr);border-radius:20px;padding:28px;display:inline-block;cursor:pointer;transition:border-color .15s" onmouseover="this.style.borderColor='var(--gold)'" onmouseout="this.style.borderColor='var(--bdr)'">
      <div style="background:#fff;border-radius:12px;padding:12px;margin-bottom:16px;display:inline-block">
        <canvas id="supportQr" width="160" height="160"></canvas>
      </div>
      <div style="font-family:'DM Mono',monospace;font-size:14px;color:var(--gold);margin-bottom:4px">satsvoucher@blink.sv</div>
      <div style="font-size:12px;color:var(--mut)">Tap to open in Lightning wallet</div>
    </div>
  </a>
</div>

<!-- ── FOOTER -->
<footer>
  <div class="footer-logo">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="24" height="24"><rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000"/><circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" stroke-width="12"/><polygon points="285,30 175,270 245,270 215,470 325,230 255,230" fill="#FFD000" stroke="#0D0D0D" stroke-width="10" stroke-linejoin="round"/></svg>
    <div style="display:flex;align-items:baseline;gap:4px">
      <span style="font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:16px;color:var(--gold)">Sats</span>
      <span style="font-family:'Barlow Condensed',sans-serif;font-weight:300;font-size:16px;color:#fff;letter-spacing:2px">VOUCHER</span>
    </div>
  </div>
  <p style="margin-bottom:8px">A Bitcoin Lightning voucher platform for retail</p>
  <p><a href="/app">Merchant App</a> &nbsp;&middot;&nbsp; <a href="#merchant">Merchant Guide</a> &nbsp;&middot;&nbsp; <a href="#customer">Customer Guide</a></p>
</footer>

<script src="https://cdn.jsdelivr.net/npm/qrcode/build/qrcode.min.js"></script>
<script>
window.addEventListener('DOMContentLoaded', function() {
  var canvas = document.getElementById('supportQr');
  if (canvas && window.QRCode) {
    QRCode.toCanvas(canvas, 'lightning:satsvoucher@blink.sv', {
      width: 160, margin: 1,
      color: { dark: '#000000', light: '#ffffff' }
    }, function(err) { if (err) console.warn('QR error:', err); });
  }
});
</script>
</body>
</html>`;

// ============================================================
// DASHBOARD — GET /dashboard
// Password protected admin monitoring view
// ============================================================

const DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Sats VOUCHER — Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Barlow:wght@300;400;600;800;900&family=Barlow+Condensed:wght@700;900&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --gold:#FFD000;--bg:#080808;--sur:#111111;--sur2:#181818;
  --bdr:#232323;--bdr2:#1a1a1a;--txt:#f0f0f0;--mut:#666;
  --red:#ff4444;--grn:#00cc55;--orange:#ff8800;
}
html,body{background:var(--bg);color:var(--txt);font-family:'Barlow',sans-serif;min-height:100vh}
.hdr{display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid var(--bdr);background:var(--bg);position:sticky;top:0;z-index:10}
.logo-row{display:flex;align-items:center;gap:8px}
.w-sats{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:18px;color:var(--gold);letter-spacing:.5px;text-transform:uppercase}
.w-vch{font-family:'Barlow Condensed',sans-serif;font-weight:300;font-size:18px;color:#fff;letter-spacing:2.5px;text-transform:uppercase}
.w-dash{font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:12px;color:var(--mut);letter-spacing:2px;text-transform:uppercase;margin-left:8px;padding-left:8px;border-left:1px solid var(--bdr)}
.store-name{font-size:12px;color:var(--mut);font-weight:600}
.content{max-width:900px;margin:0 auto;padding:20px}
/* Cards */
.card{background:var(--sur);border-radius:14px;border:1px solid var(--bdr2);padding:20px;margin-bottom:16px}
.card-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px}
.card-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px}
@media(max-width:600px){.card-grid{grid-template-columns:1fr}.card-grid-3{grid-template-columns:1fr 1fr}}
/* Solvency banner */
.solvency{border-radius:14px;padding:20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.solvency.ok{background:#001a08;border:1px solid var(--grn)}
.solvency.warn{background:#1a0800;border:1px solid var(--orange)}
.solvency.danger{background:#1a0000;border:1px solid var(--red)}
.solvency-label{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px}
.solvency.ok .solvency-label{color:var(--grn)}
.solvency.warn .solvency-label{color:var(--orange)}
.solvency.danger .solvency-label{color:var(--red)}
.solvency-msg{font-size:14px;color:var(--txt);line-height:1.4}
.solvency-dot{width:14px;height:14px;border-radius:50%;flex-shrink:0}
.solvency.ok .solvency-dot{background:var(--grn);box-shadow:0 0 8px var(--grn)}
.solvency.warn .solvency-dot{background:var(--orange);box-shadow:0 0 8px var(--orange)}
.solvency.danger .solvency-dot{background:var(--red);box-shadow:0 0 8px var(--red)}
/* Stat cards */
.stat-label{font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--mut);margin-bottom:8px}
.stat-value{font-size:28px;font-weight:200;color:var(--txt);line-height:1;font-variant-numeric:tabular-nums}
.stat-value.gold{color:var(--gold)}
.stat-value.grn{color:var(--grn)}
.stat-value.red{color:var(--red)}
.stat-value.orange{color:var(--orange)}
.stat-sub{font-size:11px;color:var(--mut);margin-top:4px;font-family:'DM Mono',monospace}
/* State row */
.state-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bdr2)}
.state-row:last-child{border-bottom:none}
.state-badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid}
.state-counts{font-family:'DM Mono',monospace;font-size:13px;color:var(--txt)}
.state-fiat{font-family:'DM Mono',monospace;font-size:11px;color:var(--mut)}
/* Section label */
.slabel{font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:var(--gold);margin-bottom:12px}
/* Voucher list */
.v-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--bdr2);gap:12px}
.v-row:last-child{border-bottom:none}
.v-id{font-family:'DM Mono',monospace;font-size:12px;color:var(--mut)}
.v-amt{font-size:15px;font-weight:600;color:#fff}
.v-date{font-family:'DM Mono',monospace;font-size:10px;color:#333;margin-top:2px}
.v-badge{padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;border:1px solid;flex-shrink:0}
/* Refresh button */
.refresh-btn{padding:6px 14px;border-radius:8px;border:1px solid var(--bdr);background:none;color:var(--mut);font-family:'Barlow',sans-serif;font-weight:600;font-size:12px;cursor:pointer}
.refresh-btn:hover{border-color:var(--gold);color:var(--gold)}
/* Logout */
.logout-btn{padding:6px 14px;border-radius:8px;border:1px solid var(--bdr);background:none;color:var(--mut);font-family:'Barlow',sans-serif;font-weight:600;font-size:12px;cursor:pointer}
/* Spin */
.spin{width:16px;height:16px;border:2px solid #333;border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;display:inline-block;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
/* Last updated */
.last-updated{font-size:10px;color:#333;text-align:right;margin-bottom:8px;font-family:'DM Mono',monospace}
/* Login screen */
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.login-card{background:var(--sur);border:1px solid var(--bdr2);border-radius:20px;padding:40px 32px;max-width:360px;width:100%;text-align:center}
.login-logo{margin-bottom:24px}
.login-title{font-size:20px;font-weight:700;color:#fff;margin-bottom:4px}
.login-sub{font-size:13px;color:var(--mut);margin-bottom:28px}
.pin-row{display:flex;gap:12px;justify-content:center;margin-bottom:20px}
.pin-dot{width:52px;height:60px;border-radius:12px;border:1px solid var(--bdr);background:#161616;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:var(--gold);font-family:'DM Mono',monospace;transition:border-color .15s}
.pin-dot.filled{border-color:#444}
.pkb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:16px;max-width:280px;margin-left:auto;margin-right:auto}
.pkb{height:52px;border-radius:12px;border:1px solid var(--bdr);background:#161616;color:#fff;font-size:22px;font-weight:400;cursor:pointer;font-family:'Barlow',sans-serif;transition:background .1s}
.pkb:active{background:#222}
.pkb-del{background:#1a0000;border-color:#2a1010;color:var(--red)}
.login-err{color:var(--red);font-size:13px;min-height:20px;margin-bottom:8px}
</style>
</head>
<body>

<!-- ── LOGIN SCREEN ── -->
<div id="loginScreen" class="login-wrap">
  <div class="login-card">
    <div class="login-logo">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="48" height="48"><rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000"/><circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" stroke-width="12"/><polygon points="285,30 175,270 245,270 215,470 325,230 255,230" fill="#FFD000" stroke="#0D0D0D" stroke-width="10" stroke-linejoin="round"/></svg>
    </div>
    <div class="login-title">Dashboard Access</div>
    <div class="login-sub">Enter your access code</div>
    <div class="pin-row">
      <div class="pin-dot" id="ld0">&middot;</div>
      <div class="pin-dot" id="ld1">&middot;</div>
      <div class="pin-dot" id="ld2">&middot;</div>
      <div class="pin-dot" id="ld3">&middot;</div>
    </div>
    <div class="pkb-grid">
      <button class="pkb" onclick="dashKey('1')">1</button><button class="pkb" onclick="dashKey('2')">2</button><button class="pkb" onclick="dashKey('3')">3</button>
      <button class="pkb" onclick="dashKey('4')">4</button><button class="pkb" onclick="dashKey('5')">5</button><button class="pkb" onclick="dashKey('6')">6</button>
      <button class="pkb" onclick="dashKey('7')">7</button><button class="pkb" onclick="dashKey('8')">8</button><button class="pkb" onclick="dashKey('9')">9</button>
      <button class="pkb" onclick="dashKey('0')" style="grid-column:2">0</button>
      <button class="pkb pkb-del" onclick="dashKey('del')">&#9003;</button>
    </div>
    <div class="login-err" id="loginErr"></div>
  </div>
</div>

<!-- ── DASHBOARD SCREEN ── -->
<div id="dashScreen" style="display:none">
  <div class="hdr">
    <div style="display:flex;align-items:center;gap:0">
      <div class="logo-row">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="28" height="28"><rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000"/><circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" stroke-width="12"/><polygon points="285,30 175,270 245,270 215,470 325,230 255,230" fill="#FFD000" stroke="#0D0D0D" stroke-width="10" stroke-linejoin="round"/></svg>
        <div style="display:flex;align-items:baseline;gap:4px">
          <span class="w-sats">Sats</span><span class="w-vch">VOUCHER</span>
        </div>
      </div>
      <span class="w-dash">Dashboard</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <span class="store-name" id="hdrStore"></span>
      <button class="refresh-btn" onclick="loadDashboard()">&#8635; Refresh</button>
      <button class="logout-btn" onclick="logout()">Logout</button>
    </div>
  </div>

  <div class="content" id="dashContent">
    <div style="text-align:center;padding:60px;color:var(--mut)"><div class="spin"></div><br><br>Loading...</div>
  </div>
</div>

<script>
var PASS = '1928';
var AUTH_KEY = 'sv_dash_auth';

// ── Auth
function isAuthed() { return localStorage.getItem(AUTH_KEY) === '1'; }
function logout() { localStorage.removeItem(AUTH_KEY); location.reload(); }

// ── PIN entry
var pin = '';
function dashKey(k) {
  if (k === 'del') {
    pin = pin.slice(0, -1);
  } else {
    if (pin.length >= 4) return;
    pin += k;
  }
  updateLoginDots();
  document.getElementById('loginErr').textContent = '';
  if (pin.length === 4) checkPin();
}

function updateLoginDots() {
  for (var i = 0; i < 4; i++) {
    var el = document.getElementById('ld' + i);
    if (i < pin.length) { el.textContent = '●'; el.classList.add('filled'); }
    else { el.textContent = '·'; el.classList.remove('filled'); }
  }
}

function checkPin() {
  if (pin === PASS) {
    localStorage.setItem(AUTH_KEY, '1');
    showDashboard();
  } else {
    document.getElementById('loginErr').textContent = 'Incorrect code';
    pin = '';
    updateLoginDots();
  }
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('dashScreen').style.display = 'block';
  loadDashboard();
}

// ── Init
if (isAuthed()) {
  showDashboard();
}

// ── Data loading
async function loadDashboard() {
  var el = document.getElementById('dashContent');
  el.innerHTML = '<div style="text-align:center;padding:60px;color:var(--mut)"><div class="spin"></div><br><br>Loading...</div>';
  try {
    var results = await Promise.all([
      fetch('/treasury').then(function(r){return r.json();}),
      fetch('/vouchers').then(function(r){return r.json();}),
      fetch('/dashboard/settings').then(function(r){return r.json();}),
      fetch('/satscash/list').then(function(r){return r.json();}).catch(function(){return [];})
    ]);
    var treasury = results[0];
    var vouchers = Array.isArray(results[1]) ? results[1] : [];
    var settings = results[2];
    var coins = Array.isArray(results[3]) ? results[3] : [];

    renderDashboard(treasury, vouchers, settings, coins);
  } catch(e) {
    el.innerHTML = '<div style="color:var(--red);padding:40px;text-align:center">Load error: ' + e.message + '</div>';
  }
}

function sats(n) { return Number(n || 0).toLocaleString() + ' sats'; }
function btc(n) { return (Number(n || 0) / 100000000).toFixed(8) + ' BTC'; }
function fiat(sym, n) { return (sym || '€') + parseFloat(n || 0).toFixed(2); }
function fmt(d) { return d ? new Date(d).toLocaleDateString('en-GB') : '--'; }

var STATUS_COLOR = {
  active: '#00cc55', pending: '#FFD000', redeemed: '#555',
  claimed: '#555', expired: '#ff4444', locked: '#ff8800'
};
var STATUS_LABEL = {
  active: 'Active', pending: 'Pending', redeemed: 'Redeemed',
  claimed: 'Redeemed', expired: 'Expired', locked: 'Locked'
};

function renderDashboard(treasury, vouchers, settings, coins) {
  var storeName = (settings && settings.storeName) || 'BOSA';
  var sym = (settings && settings.currencySymbol) || '€';
  document.getElementById('hdrStore').textContent = storeName;

  // Aggregate by state
  var agg = { active:{count:0,btc:0,fiat:0}, pending:{count:0,btc:0,fiat:0},
              redeemed:{count:0,btc:0,fiat:0}, expired:{count:0,btc:0,fiat:0},
              locked:{count:0,btc:0,fiat:0} };
  var totalIssued = 0, totalIssuedFiat = 0;
  var today = new Date().toLocaleDateString('en-GB');
  var todayCount = 0;

  vouchers.forEach(function(v) {
    var st = v.status === 'claimed' ? 'redeemed' : (v.status || 'active');
    // Check live expiry
    if ((st === 'active' || st === 'locked') && v.expiryDate && new Date(v.expiryDate) < new Date()) st = 'expired';
    if (!agg[st]) agg[st] = {count:0,btc:0,fiat:0};
    agg[st].count++;
    agg[st].btc += parseFloat(v.amountBtc || 0);
    agg[st].fiat += parseFloat(v.amountFiat || 0);
    totalIssued++;
    totalIssuedFiat += parseFloat(v.amountFiat || 0);
    if (v.createdAt && new Date(v.createdAt).toLocaleDateString('en-GB') === today) todayCount++;
  });

  // Solvency calculation
  var walletSats = treasury.balance || 0;

  // SatsCASH aggregates
  var scActive = coins.filter(function(c){return c.status==='active';});
  var scRedeemed = coins.filter(function(c){return c.status==='redeemed';});
  var scActiveSats = scActive.reduce(function(s,c){return s+(c.sats||0);},0);
  var scRedeemedSats = scRedeemed.reduce(function(s,c){return s+(c.totalSatsRedeemed||0);},0);

  // Combined solvency — vouchers + SatsCASH
  var liabilitySats = Math.round((agg.active.btc + agg.pending.btc) * 100000000) + scActiveSats;
  var surplusSats = walletSats - liabilitySats;
  var liabilityFiat = agg.active.fiat + agg.pending.fiat;
  var solvent = surplusSats >= 0;
  var solventClass = surplusSats > 0 ? 'ok' : surplusSats === 0 ? 'warn' : 'danger';
  var solventMsg = solvent
    ? 'Wallet covers all unredeemed vouchers. Surplus: ' + sats(surplusSats)
    : 'WARNING: Wallet is short by ' + sats(Math.abs(surplusSats)) + '. Top up immediately.';

  // Recent vouchers — last 20
  var recent = vouchers.slice(0, 20);

  // Velocity
  var weekAgo = new Date(Date.now() - 7*86400000);
  var weekCount = vouchers.filter(function(v){return v.createdAt && new Date(v.createdAt) > weekAgo;}).length;

  var now = new Date().toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'});
  var nowDate = new Date().toLocaleDateString('en-GB');

  var html = '';

  // Last updated
  html += '<div class="last-updated">Updated ' + nowDate + ' ' + now + '</div>';

  // Solvency banner
  html += '<div class="solvency ' + solventClass + '">';
  html += '<div><div class="solvency-label">System Solvency</div><div class="solvency-msg">' + solventMsg + '</div></div>';
  html += '<div class="solvency-dot"></div></div>';

  // Top stats — wallet and liability
  html += '<div class="card-grid">';
  html += '<div class="card"><div class="stat-label">Treasury Balance</div>';
  html += '<div class="stat-value gold">' + sats(walletSats) + '</div>';
  html += '<div class="stat-sub">' + btc(walletSats) + '</div></div>';

  html += '<div class="card"><div class="stat-label">Unredeemed Liability</div>';
  html += '<div class="stat-value' + (solvent?'':' red') + '">' + fiat(sym, liabilityFiat) + '</div>';
  html += '<div class="stat-sub">' + sats(liabilitySats) + '</div></div>';
  html += '</div>';

  // Secondary stats
  html += '<div class="card-grid-3">';
  html += '<div class="card"><div class="stat-label">Total Issued</div>';
  html += '<div class="stat-value">' + totalIssued + '</div>';
  html += '<div class="stat-sub">' + fiat(sym, totalIssuedFiat) + '</div></div>';

  html += '<div class="card"><div class="stat-label">Issued Today</div>';
  html += '<div class="stat-value gold">' + todayCount + '</div>';
  html += '<div class="stat-sub">Last 7 days: ' + weekCount + '</div></div>';

  html += '<div class="card"><div class="stat-label">Expired (Profit)</div>';
  html += '<div class="stat-value grn">' + fiat(sym, agg.expired.fiat) + '</div>';
  html += '<div class="stat-sub">' + agg.expired.count + ' voucher' + (agg.expired.count!==1?'s':'') + '</div></div>';
  html += '</div>';

  // Voucher state breakdown
  html += '<div class="card"><div class="slabel">Vouchers by State</div>';
  var states = ['active','pending','redeemed','expired','locked'];
  states.forEach(function(st) {
    var a = agg[st];
    if (!a) return;
    var col = STATUS_COLOR[st] || '#888';
    var lbl = STATUS_LABEL[st] || st;
    html += '<div class="state-row">';
    html += '<span class="state-badge" style="color:' + col + ';border-color:' + col + '">' + lbl + '</span>';
    html += '<div style="flex:1;padding:0 16px"><div class="state-counts">' + fiat(sym, a.fiat) + '</div>';
    html += '<div class="state-fiat">' + a.count + ' voucher' + (a.count!==1?'s':'') + ' &middot; ' + sats(Math.round(a.btc*1e8)) + '</div></div>';
    html += '</div>';
  });
  html += '</div>';

  // Recent vouchers
  html += '<div class="card"><div class="slabel">Recent Vouchers</div>';
  if (!recent.length) {
    html += '<div style="color:var(--mut);font-size:13px;padding:10px 0">No vouchers yet</div>';
  } else {
    recent.forEach(function(v) {
      var st = v.status === 'claimed' ? 'redeemed' : (v.status || 'active');
      if ((st==='active'||st==='locked') && v.expiryDate && new Date(v.expiryDate)<new Date()) st='expired';
      var col = STATUS_COLOR[st] || '#888';
      var lbl = STATUS_LABEL[st] || st;
      var vsym = v.currencySymbol || sym;
      html += '<div class="v-row">';
      html += '<div><div class="v-amt">' + vsym + parseFloat(v.amountFiat||0).toFixed(2) + '</div>';
      html += '<div class="v-date">' + fmt(v.createdAt) + ' &middot; ' + (v.id||'').toUpperCase() + '</div>';
      if (v.expiryDate) html += '<div class="v-date">Expires ' + fmt(v.expiryDate) + '</div>';
      html += '</div>';
      html += '<span class="v-badge" style="color:' + col + ';border-color:' + col + '">' + lbl + '</span>';
      html += '</div>';
    });
  }
  html += '</div>';

  // SatsCASH panel
  html += '<div class="card"><div class="slabel">SatsCASH Coins</div>';
  if (!coins.length) {
    html += '<div style="color:var(--mut);font-size:13px;padding:8px 0">No coins minted yet</div>';
  } else {
    // Coin breakdown by colour
    var coinByColour = {};
    coins.forEach(function(c) {
      if (!coinByColour[c.colour]) coinByColour[c.colour] = {active:0,redeemed:0,sats:0};
      if (c.status==='active') { coinByColour[c.colour].active++; coinByColour[c.colour].sats+=c.sats||0; }
      if (c.status==='redeemed') coinByColour[c.colour].redeemed++;
    });
    var colHex = {red:'#e53935',blue:'#1e88e5',green:'#43a047',gold:'#FFD000',black:'#888'};
    Object.keys(coinByColour).forEach(function(col) {
      var cd = coinByColour[col];
      var hex = colHex[col]||'#888';
      html += '<div class="state-row">';
      html += '<div style="display:flex;align-items:center;gap:8px"><div style="width:12px;height:12px;border-radius:50%;background:'+hex+';flex-shrink:0"></div>';
      html += '<span style="color:#ccc;font-size:13px;text-transform:capitalize">'+col+'</span></div>';
      html += '<div style="flex:1;padding:0 12px">';
      html += '<div class="state-counts">'+cd.active+' active &nbsp;·&nbsp; '+cd.redeemed+' redeemed</div>';
      html += '<div class="state-fiat">'+sats(cd.sats)+' in circulation</div>';
      html += '</div></div>';
    });
    html += '<div style="border-top:1px solid var(--bdr2);margin-top:8px;padding-top:8px">';
    html += '<div style="display:flex;justify-content:space-between"><span style="color:var(--mut);font-size:12px">Total in circulation</span>';
    html += '<span style="font-family:monospace;font-size:13px;color:var(--gold)">'+sats(scActiveSats)+'</span></div>';
    html += '<div style="display:flex;justify-content:space-between;margin-top:4px"><span style="color:var(--mut);font-size:12px">Total redeemed (lifetime)</span>';
    html += '<span style="font-family:monospace;font-size:13px;color:#555">'+sats(scRedeemedSats)+'</span></div>';
    html += '</div>';
  }
  html += '</div>';

  html += '<div style="height:40px"></div>';

  document.getElementById('dashContent').innerHTML = html;
}
</script>
</body>
</html>`;

// ============================================================
// SATSCASH — Denomination map
// ============================================================

const SATSCASH_DENOMS = {
    red:   5000,
    blue:  10000,
    green: 50000,
    gold:  100000,
    black: 500000
};

// ============================================================
// SATSCASH — Holder verify page /c/:uid
// ============================================================

function satscashVerifyPage(coin, uid, origin, btcPriceEur) {
    const colour = coin.colour || 'red';
    const sats = coin.sats || 0;
    const status = coin.status || 'unknown';

    const colourHex = {
        red:'#e53935', blue:'#1e88e5', green:'#43a047',
        gold:'#FFD000', black:'#333333'
    }[colour] || '#888';

    const colourLabel = colour.charAt(0).toUpperCase() + colour.slice(1);
    const isActive = status === 'active';
    const statusCol = isActive ? '#00cc55' : '#ff4444';
    const statusLabel = isActive ? 'Active' : (status === 'redeemed' ? 'Redeemed' : status.charAt(0).toUpperCase()+status.slice(1));

    const fiatLine = btcPriceEur
        ? `<div style="font-size:16px;color:#888;font-family:'DM Mono',monospace;margin-top:6px">&#x2248; &#8364;${((sats/100000000)*btcPriceEur).toFixed(2)} today</div>`
        : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>SatsCASH</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Barlow:wght@300;400;600;800;900&family=Barlow+Condensed:wght@700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--gold:#FFD000;--bg:#080808;--sur:#111;--bdr:#222;--txt:#f0f0f0;--mut:#555}
body{background:var(--bg);color:var(--txt);font-family:'Barlow',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.wrap{width:100%;max-width:360px;text-align:center}
.logo-row{display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:28px}
.w-sats{font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:18px;color:var(--gold);letter-spacing:.5px;text-transform:uppercase}
.w-cash{font-family:'Barlow Condensed',sans-serif;font-weight:300;font-size:18px;color:#fff;letter-spacing:2.5px;text-transform:uppercase}
.coin{width:100px;height:100px;border-radius:50%;margin:0 auto 20px;border:4px solid ${colourHex};background:${colour === 'black' ? '#1a1a1a' : colourHex + '22'};display:flex;align-items:center;justify-content:center}
.sats{font-size:52px;font-weight:200;color:var(--gold);line-height:1;font-variant-numeric:tabular-nums}
.sats-label{font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#555;margin-top:4px}
.badge{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border-radius:20px;border:1px solid ${statusCol};color:${statusCol};font-size:13px;font-weight:700;margin:16px 0}
.instruction{background:var(--sur);border:1px solid var(--bdr);border-radius:14px;padding:16px;margin-top:16px;font-size:13px;color:#888;line-height:1.6}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo-row">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="28" height="28"><rect x="0" y="0" width="500" height="500" rx="80" ry="80" fill="#FFD000"/><circle cx="250" cy="250" r="190" fill="#C8C8C8" stroke="#0D0D0D" stroke-width="12"/><polygon points="285,30 175,270 245,270 215,470 325,230 255,230" fill="#FFD000" stroke="#0D0D0D" stroke-width="10" stroke-linejoin="round"/></svg>
    <div style="display:flex;align-items:baseline;gap:4px">
      <span class="w-sats">Sats</span><span class="w-cash">CASH</span>
    </div>
  </div>

  <div class="coin">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="48" height="48"><circle cx="250" cy="250" r="220" fill="${colourHex}" opacity="0.9"/><polygon points="285,80 175,270 245,270 215,420 325,230 255,230" fill="#fff" opacity="0.9"/></svg>
  </div>

  <div style="font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#555;margin-bottom:8px">${colourLabel} Coin</div>

  <div class="sats">${sats.toLocaleString()}</div>
  <div class="sats-label">Sats</div>
  ${fiatLine}

  <div class="badge">${statusLabel}</div>

  ${isActive ? `
  <div class="instruction">
    <strong style="color:#ccc">Take this coin to a participating merchant</strong><br>
    They will tap it on their terminal and generate a Lightning payment for you to scan.
  </div>` : `
  <div class="instruction" style="border-color:#3a0000">
    <strong style="color:#ff6666">This coin has no current value</strong><br>
    Return it to a merchant to be recharged.
  </div>`}
</div>
</body>
</html>`;
}

// ============================================================
// BECH32 + BLINK — UNCHANGED from v1.1
// ============================================================

function encodeBech32(hrp, data) {
    const charset = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    const words = [];
    let buffer = 0, bits = 0;
    for (let i = 0; i < data.length; i++) {
        buffer = (buffer << 8) | data.charCodeAt(i);
        bits += 8;
        while (bits >= 5) { bits -= 5; words.push((buffer >> bits) & 0x1f); }
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
        const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
        for (let v of values) {
            let top = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ v;
            for (let i = 0; i < 5; i++) { if ((top >> i) & 1) chk ^= gen[i]; }
        }
        return chk;
    };
    const mod = polymod(expandHrp(hrp).concat(words).concat([0,0,0,0,0,0])) ^ 1;
    const checksum = [];
    for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
    return hrp + "1" + words.concat(checksum).map(v => charset[v]).join("");
}

async function payInvoice(paymentRequest, walletId, apiKey) {
    const r = await fetch("https://api.blink.sv/graphql", {
        method: "POST",
        headers: { "X-API-KEY": apiKey.trim(), "Content-Type": "application/json" },
        body: JSON.stringify({
            query: `mutation LnInvoicePaymentSend($input: LnInvoicePaymentInput!) {
                lnInvoicePaymentSend(input: $input) { status, errors { message } }
            }`,
            variables: { input: { walletId: walletId.trim(), paymentRequest: paymentRequest.trim() } }
        })
    });
    const result = await r.json();
    const data = result.data?.lnInvoicePaymentSend;
    if (data?.errors?.length > 0) throw new Error(data.errors[0].message);
    return data?.status;
}

// ============================================================
// MAIN HANDLER
// ============================================================

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname.replace(/\/$/, "").toLowerCase();
        const cors = { "Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"*" };
        const jh = { ...cors, "Content-Type":"application/json" };
        const hh = { "Content-Type":"text/html;charset=UTF-8" };

        if (request.method === "OPTIONS") return new Response(null, { headers: cors });

        // ── Dashboard
        if (path === "/dashboard" && request.method === "GET") {
            return new Response(DASHBOARD, { headers: hh });
        }

        // ── Dashboard settings — returns store name from most recent voucher
        if (path === "/dashboard/settings" && request.method === "GET") {
            try {
                const list = await env.VOUCHERS.list({ prefix: "voucher:", limit: 50 });
                const items = await Promise.all(list.keys.map(async k => {
                    const raw = await env.VOUCHERS.get(k.name);
                    return raw ? JSON.parse(raw) : null;
                }));
                const sorted = items.filter(Boolean).sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
                const latest = sorted[0];
                return new Response(JSON.stringify({
                    storeName: latest?.storeName || 'BOSA',
                    currencySymbol: latest?.currencySymbol || '€',
                    currency: latest?.currency || 'EUR'
                }), { headers: jh });
            } catch(e) {
                return new Response(JSON.stringify({ storeName: 'BOSA', currencySymbol: '€' }), { headers: jh });
            }
        }

        // ── Web app screens
        if (path === "")                          return new Response(HOMEPAGE, { headers: hh });
        if (path === "/demo")                    return new Response(DEMO,     { headers: hh });
        if (path === "/app")                     return new Response(SALE,     { headers: hh });
        if (path === "/app/confirm")          return new Response(CONFIRM,  { headers: hh });
        if (path === "/app/history")          return new Response(HISTORY,  { headers: hh });
        if (path === "/app/settings")         return new Response(SETTINGS, { headers: hh });
        if (path === "/app/satscash")          return new Response(SC_HUB,    { headers: hh });
        if (path === "/app/satscash/mint")     return new Response(SC_MINT,   { headers: hh });
        if (path === "/app/satscash/redeem")   return new Response(SC_REDEEM, { headers: hh });

        // ── Treasury
        if (path === "/treasury" && request.method === "GET") {
            const r = await fetch("https://api.blink.sv/graphql", {
                method:"POST", headers:{"X-API-KEY":env.BLINK_API_KEY.trim(),"Content-Type":"application/json"},
                body: JSON.stringify({query:`query{me{defaultAccount{walletById(walletId:"${env.BLINK_WALLET_ID}"){balance}}}}`})
            });
            const d = await r.json();
            return new Response(JSON.stringify({balance:d.data?.me?.defaultAccount?.walletById?.balance||0}),{headers:jh});
        }

        // ── Voucher list
        if (path === "/vouchers" && request.method === "GET") {
            try {
                const list = await env.VOUCHERS.list({ prefix:"voucher:", limit:50 });
                const items = await Promise.all(list.keys.map(async k => {
                    const raw = await env.VOUCHERS.get(k.name);
                    if (!raw) return null;
                    const v = JSON.parse(raw);
                    // Normalise legacy status: v1.1 used 'claimed', v2 uses 'redeemed'
                    if (v.status === 'claimed') v.status = 'redeemed';
                    // Strip sensitive fields before returning to client
                    const { pinHash, pinSalt, k1, lnurl, ...safe } = v;
                    return safe;
                }));
                const results = items.filter(Boolean).sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
                return new Response(JSON.stringify(results), {headers:jh});
            } catch(e) { return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh}); }
        }

        // ── Single voucher (safe fields only)
        if (path.startsWith("/voucher/") && !path.includes("/transfer") && !path.includes("/redeem") && request.method === "GET") {
            const id = path.split("/")[2];
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response(JSON.stringify({error:"Not Found"}),{status:404,headers:jh});
            const v = JSON.parse(raw);
            const { pinHash, pinSalt, k1, ...safe } = v;
            return new Response(JSON.stringify(safe), {headers:jh});
        }

        // ── Create voucher (v2: no LNURL, generates PIN)
        if (path === "/voucher" && request.method === "POST") {
            try {
                const body = await request.json();
                const id = (body.id || Math.random().toString(36).substring(2,8)).toLowerCase();
                const cleanBtc = parseFloat(body.amountBtc).toFixed(8);

                // Generate PIN and hash it
                const pin = generatePin();
                const { hash: pinHash, salt: pinSalt } = await hashPin(pin);

                // Calculate expiry date
                const expiryDays = body.expiryDays || 90;
                const expiryDate = new Date();
                expiryDate.setDate(expiryDate.getDate() + expiryDays);

                const data = {
                    id,
                    storeName:      body.storeName || 'BOSA',
                    amountFiat:     body.amountFiat,
                    amountBtc:      cleanBtc,
                    currency:       body.currency || 'EUR',
                    currencySymbol: body.currencySymbol || '€',
                    status:         'active',
                    pinHash,
                    pinSalt,
                    redeemAttempts:    0,
                    redeemLockedUntil: null,
                    redeemExposeCount: 0,
                    createdAt:   new Date().toISOString(),
                    expiryDate:  expiryDate.toISOString(),
                    // k1 kept for LNURL-withdraw compatibility if needed
                    k1: Math.random().toString(36).substring(2,15),
                };

                await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(data));

                // Return PIN in plaintext once only — never stored in plain text after this
                return new Response(JSON.stringify({ status:"OK", id, pin }), {headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh});
            }
        }

        // ── Verify PIN only — POST /voucher/:id/verify-pin
        // Used by transfer step 1 to validate current PIN before advancing UI
        if (path.match(/^\/voucher\/[^\/]+\/verify-pin$/) && request.method === "POST") {
            try {
                const id = path.split("/")[2];
                const body = await request.json();
                const { pin } = body;
                if (!pin) return new Response(JSON.stringify({error:"Missing PIN"}),{status:400,headers:jh});
                const raw = await env.VOUCHERS.get(`voucher:${id}`);
                if (!raw) return new Response(JSON.stringify({error:"Not Found"}),{status:404,headers:jh});
                const v = JSON.parse(raw);
                if (isExpired(v)) return new Response(JSON.stringify({error:"Voucher has expired"}),{status:400,headers:jh});
                if (v.status !== 'active') return new Response(JSON.stringify({error:"Voucher is not active"}),{status:400,headers:jh});
                const ok = await verifyPin(pin, v.pinHash, v.pinSalt);
                if (!ok) return new Response(JSON.stringify({error:"Incorrect PIN"}),{status:403,headers:jh});
                return new Response(JSON.stringify({status:"OK"}),{headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh});
            }
        }

        // ── Transfer PIN — POST /voucher/:id/transfer
        if (path.match(/^\/voucher\/[^/]+\/transfer$/) && request.method === "POST") {
            try {
                const id = path.split("/")[2];
                const body = await request.json();
                const { currentPin, newPin } = body;

                if (!currentPin || !newPin) return new Response(JSON.stringify({error:"Missing PIN"}),{status:400,headers:jh});
                if (!/^\d{4}$/.test(newPin)) return new Response(JSON.stringify({error:"PIN must be 4 digits"}),{status:400,headers:jh});

                const raw = await env.VOUCHERS.get(`voucher:${id}`);
                if (!raw) return new Response(JSON.stringify({error:"Not Found"}),{status:404,headers:jh});
                const v = JSON.parse(raw);

                // Expiry overrides all
                if (isExpired(v)) return new Response(JSON.stringify({error:"Voucher has expired"}),{status:400,headers:jh});
                if (v.status !== 'active') return new Response(JSON.stringify({error:"Voucher is not active"}),{status:400,headers:jh});

                // Verify current PIN
                const ok = await verifyPin(currentPin, v.pinHash, v.pinSalt);
                if (!ok) return new Response(JSON.stringify({error:"Incorrect current PIN"}),{status:403,headers:jh});

                if (newPin === currentPin) return new Response(JSON.stringify({error:"New PIN must differ from current PIN"}),{status:400,headers:jh});

                // Hash and store new PIN
                const { hash: pinHash, salt: pinSalt } = await hashPin(newPin);
                v.pinHash = pinHash;
                v.pinSalt = pinSalt;
                v.transferredAt = new Date().toISOString();

                await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));
                return new Response(JSON.stringify({status:"OK"}),{headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh});
            }
        }

        // ── Redeem — POST /voucher/:id/redeem
        // Verifies PIN, creates LNURL on-demand, exposes once
        if (path.match(/^\/voucher\/[^/]+\/redeem$/) && request.method === "POST") {
            try {
                const id = path.split("/")[2];
                const body = await request.json();
                const { pin } = body;

                if (!pin) return new Response(JSON.stringify({error:"Missing PIN"}),{status:400,headers:jh});

                const raw = await env.VOUCHERS.get(`voucher:${id}`);
                if (!raw) return new Response(JSON.stringify({error:"Not Found"}),{status:404,headers:jh});
                const v = JSON.parse(raw);

                // Expiry overrides all
                if (isExpired(v) && v.status !== 'redeemed') {
                    if (v.status !== 'expired') {
                        v.status = 'expired';
                        await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));
                    }
                    return new Response(JSON.stringify({error:"Voucher has expired"}),{status:400,headers:jh});
                }

                // Check if LNURL was already exposed — pending state
                if (v.redeemExposeCount > 0) {
                    return new Response(JSON.stringify({error:"Redemption QR already revealed. Check your saved photos."}),{status:400,headers:jh});
                }

                // Check lockout
                if (v.status === 'locked') {
                    if (isLocked(v)) {
                        return new Response(JSON.stringify({error:"Too many attempts. Try again later.", locked:true}),{status:429,headers:jh});
                    }
                    // Lockout expired — restore to active
                    v.status = 'active';
                    v.redeemAttempts = 0;
                    v.redeemLockedUntil = null;
                }

                if (v.status !== 'active') {
                    return new Response(JSON.stringify({error:"Voucher is not available for redemption"}),{status:400,headers:jh});
                }

                // Verify PIN
                const ok = await verifyPin(pin, v.pinHash, v.pinSalt);
                if (!ok) {
                    v.redeemAttempts = (v.redeemAttempts || 0) + 1;
                    if (v.redeemAttempts >= 3) {
                        v.status = 'locked';
                        v.redeemLockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                        await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));
                        return new Response(JSON.stringify({error:"Too many attempts. Locked for 24 hours.", locked:true}),{status:429,headers:jh});
                    }
                    await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));
                    const left = 3 - v.redeemAttempts;
                    return new Response(JSON.stringify({error:`Incorrect PIN. ${left} attempt(s) remaining.`}),{status:403,headers:jh});
                }

                // PIN correct — generate LNURL on-demand (Option 3)
                const lnurl = encodeBech32("lnurl", `${url.origin}/lnurlw/${id}`).toUpperCase();

                // Mark as pending and increment expose count atomically
                v.status = 'pending';
                v.redeemExposeCount = 1;
                v.redeemAttempts = 0;
                v.pendingAt = new Date().toISOString();
                // Store the k1 needed for LNURL-withdraw handshake
                v.k1 = v.k1 || Math.random().toString(36).substring(2,15);

                await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));

                return new Response(JSON.stringify({status:"OK", lnurl}),{headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh});
            }
        }

        // ── Verification page — GET /v/:id
        if (path.startsWith("/v/") && request.method === "GET") {
            const id = path.split("/")[2];
            if (!id) return new Response("Not Found", {status:404});
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response(
                `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Not Found</title></head><body style="background:#080808;color:#f0f0f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center"><div><div style="font-size:48px;margin-bottom:16px">⚠️</div><div style="font-size:20px;font-weight:700;margin-bottom:8px">Voucher Not Found</div><div style="color:#555;font-size:14px">Check the QR code or voucher ID and try again</div></div></body></html>`,
                { headers: hh }
            );
            const v = JSON.parse(raw);

            // Auto-expire check on page load
            if (isExpired(v) && v.status !== 'redeemed' && v.status !== 'expired') {
                v.status = 'expired';
                await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));
            }

            return new Response(verificationPage(v, id, url.origin), { headers: hh });
        }

        // ── LNURL step 1 — UNCHANGED from v1.1
        if (path.startsWith("/lnurlw/") && !path.includes("callback")) {
            const id = path.split("/")[2];
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response("Not Found",{status:404});
            const v = JSON.parse(raw);
            // Only serve LNURL if voucher is pending (QR was properly exposed)
            if (v.status !== 'pending') return new Response(JSON.stringify({status:"ERROR",reason:"Voucher not available"}),{headers:jh});
            const msats = Math.floor(parseFloat(v.amountBtc) * 100_000_000 * 1000);
            return new Response(JSON.stringify({
                tag:"withdrawRequest",
                callback:`${url.origin}/lnurlw/callback/${id}`,
                k1:v.k1,
                defaultDescription:`Voucher ${id}`,
                minWithdrawable:msats,
                maxWithdrawable:msats
            }),{headers:jh});
        }

        // ── LNURL step 2 callback — UNCHANGED Blink logic, updated status to 'redeemed'
        if (path.startsWith("/lnurlw/callback/")) {
            const id = path.split("/")[3];
            const pr = url.searchParams.get("pr");
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response("Not Found",{status:404});
            const v = JSON.parse(raw);
            // Guard: only allow if pending
            if (v.status === "redeemed") return new Response(JSON.stringify({status:"ERROR",reason:"Already redeemed"}),{headers:jh});
            if (v.status !== "pending") return new Response(JSON.stringify({status:"ERROR",reason:"Voucher not in redeemable state"}),{headers:jh});
            try {
                await payInvoice(pr, env.BLINK_WALLET_ID, env.BLINK_API_KEY);
                // Updated: 'claimed' → 'redeemed' to match new state vocabulary
                v.status = "redeemed";
                v.redeemedAt = new Date().toISOString();
                await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));
                return new Response(JSON.stringify({status:"OK"}),{headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({status:"ERROR",reason:e.message}),{status:500,headers:jh});
            }
        }

        // ── SatsCASH holder verify page — GET /c/:uid
        if (path.startsWith("/c/") && request.method === "GET") {
            const uid = decodeURIComponent(path.slice(3)).toUpperCase();
            if (!uid) return new Response("Not Found", {status:404});
            const raw = await env.VOUCHERS.get(`satscash:${uid}`);
            if (!raw) return new Response(
                `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SatsCASH</title></head><body style="background:#080808;color:#f0f0f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center"><div><div style="font-size:48px;margin-bottom:16px">&#9888;</div><div style="font-size:20px;font-weight:700;margin-bottom:8px">Coin Not Recognised</div><div style="color:#555;font-size:14px">This coin is not part of the local economy</div></div></body></html>`,
                { headers: hh }
            );
            const coin = JSON.parse(raw);
            // Fetch live BTC price for fiat display
            let btcPrice = null;
            try {
                const pr = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur", {signal: AbortSignal.timeout(4000)});
                const pd = await pr.json();
                btcPrice = pd?.bitcoin?.eur || null;
            } catch(e) {}
            return new Response(satscashVerifyPage(coin, uid, url.origin, btcPrice), { headers: hh });
        }

        // ── SatsCASH mint — POST /satscash/mint
        if (path === "/satscash/mint" && request.method === "POST") {
            try {
                const body = await request.json();
                const { colour } = body;
                const uid = (body.uid || '').toUpperCase();
                if (!uid) return new Response(JSON.stringify({error:"Missing UID"}),{status:400,headers:jh});
                if (!SATSCASH_DENOMS[colour]) return new Response(JSON.stringify({error:"Invalid colour"}),{status:400,headers:jh});

                const sats = SATSCASH_DENOMS[colour];
                const existing = await env.VOUCHERS.get(`satscash:${uid}`);
                const mintCount = existing ? (JSON.parse(existing).mintCount || 0) + 1 : 1;
                const totalSatsRedeemed = existing ? (JSON.parse(existing).totalSatsRedeemed || 0) : 0;

                const coin = {
                    uid,
                    colour,
                    sats,
                    status: 'active',
                    mintCount,
                    totalSatsRedeemed,
                    mintedAt: new Date().toISOString(),
                    lastRedeemedAt: existing ? JSON.parse(existing).lastRedeemedAt : null,
                    k1: Math.random().toString(36).substring(2,15)
                };

                await env.VOUCHERS.put(`satscash:${uid}`, JSON.stringify(coin));
                return new Response(JSON.stringify({status:"OK", uid, colour, sats, mintCount}), {headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh});
            }
        }

        // ── SatsCASH lookup — GET /satscash/:uid
        if (path.startsWith("/satscash/") && request.method === "GET" && path !== "/satscash/list") {
            try {
                const uid = decodeURIComponent(path.slice(10)).toUpperCase();
                const raw = await env.VOUCHERS.get(`satscash:${uid}`);
                if (!raw) return new Response(JSON.stringify({error:"Coin not recognised"}),{status:404,headers:jh});
                const coin = JSON.parse(raw);
                const { k1, ...safe } = coin;
                return new Response(JSON.stringify(safe), {headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh});
            }
        }

        // ── SatsCASH redeem — POST /satscash/redeem
        if (path === "/satscash/redeem" && request.method === "POST") {
            try {
                const body = await request.json();
                const uid = (body.uid || '').toUpperCase();
                if (!uid) return new Response(JSON.stringify({error:"Missing UID"}),{status:400,headers:jh});

                const raw = await env.VOUCHERS.get(`satscash:${uid}`);
                if (!raw) return new Response(JSON.stringify({error:"Coin not recognised"}),{status:404,headers:jh});
                const coin = JSON.parse(raw);

                if (coin.status !== 'active') return new Response(JSON.stringify({error:"Coin is " + coin.status}),{status:400,headers:jh});

                // Generate LNURL on demand
                const lnurl = encodeBech32("lnurl", `${url.origin}/lnurlsc/${uid}`).toUpperCase();

                // Mark as redeemed immediately
                coin.status = 'redeemed';
                coin.lastRedeemedAt = new Date().toISOString();
                coin.totalSatsRedeemed = (coin.totalSatsRedeemed || 0) + coin.sats;
                // Refresh k1 for this redemption
                coin.k1 = Math.random().toString(36).substring(2,15);

                await env.VOUCHERS.put(`satscash:${uid}`, JSON.stringify(coin));

                return new Response(JSON.stringify({status:"OK", lnurl, sats:coin.sats}), {headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh});
            }
        }

        // ── SatsCASH list — GET /satscash/list
        if (path === "/satscash/list" && request.method === "GET") {
            try {
                const list = await env.VOUCHERS.list({ prefix:"satscash:", limit:200 });
                const items = await Promise.all(list.keys.map(async k => {
                    const raw = await env.VOUCHERS.get(k.name);
                    if (!raw) return null;
                    const coin = JSON.parse(raw);
                    const { k1, ...safe } = coin;
                    return safe;
                }));
                return new Response(JSON.stringify(items.filter(Boolean)), {headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh});
            }
        }

        // ── SatsCASH LNURL step 1 — GET /lnurlsc/:uid
        if (path.startsWith("/lnurlsc/") && !path.includes("callback") && request.method === "GET") {
            try {
                const uid = decodeURIComponent(path.slice(9)).toUpperCase();
                const raw = await env.VOUCHERS.get(`satscash:${uid}`);
                if (!raw) return new Response(JSON.stringify({status:"ERROR",reason:"Not Found"}),{headers:jh});
                const coin = JSON.parse(raw);
                if (coin.status !== 'redeemed') return new Response(JSON.stringify({status:"ERROR",reason:"Coin not available"}),{headers:jh});
                const msats = coin.sats * 1000;
                return new Response(JSON.stringify({
                    tag: "withdrawRequest",
                    callback: `${url.origin}/lnurlsc/callback/${encodeURIComponent(uid)}`,
                    k1: coin.k1,
                    defaultDescription: `SatsCASH ${coin.colour} coin`,
                    minWithdrawable: msats,
                    maxWithdrawable: msats
                }), {headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({status:"ERROR",reason:e.message}),{status:500,headers:jh});
            }
        }

        // ── SatsCASH LNURL callback step 2 — GET /lnurlsc/callback/:uid
        if (path.startsWith("/lnurlsc/callback/") && request.method === "GET") {
            try {
                const uid = decodeURIComponent(path.slice(18)).toUpperCase();
                const pr = url.searchParams.get("pr");
                const raw = await env.VOUCHERS.get(`satscash:${uid}`);
                if (!raw) return new Response(JSON.stringify({status:"ERROR",reason:"Not Found"}),{headers:jh});
                const coin = JSON.parse(raw);
                await payInvoice(pr, env.BLINK_WALLET_ID, env.BLINK_API_KEY);
                // Coin remains redeemed — awaiting recharge from merchant
                return new Response(JSON.stringify({status:"OK"}), {headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({status:"ERROR",reason:e.message}),{status:500,headers:jh});
            }
        }

        return new Response(`Not found: ${path}`,{status:404});
    },

    // ── Daily cron — expires vouchers past their expiry date
    // Add to wrangler.toml: [triggers] crons = ["0 0 * * *"]
    async scheduled(event, env, ctx) {
        const list = await env.VOUCHERS.list({ prefix: 'voucher:' });
        let expired = 0;
        for (const key of list.keys) {
            const raw = await env.VOUCHERS.get(key.name);
            if (!raw) continue;
            const v = JSON.parse(raw);
            // Only expire active or locked vouchers — never touch pending/redeemed
            if ((v.status === 'active' || v.status === 'locked') && v.expiryDate) {
                if (new Date(v.expiryDate) < new Date()) {
                    v.status = 'expired';
                    v.expiredAt = new Date().toISOString();
                    await env.VOUCHERS.put(key.name, JSON.stringify(v));
                    expired++;
                }
            }
        }
        console.log(`Expiry cron: ${expired} voucher(s) marked expired`);
    }
};
