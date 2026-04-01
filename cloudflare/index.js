// ============================================================
// SATS VOUCHER — Cloudflare Worker v1.1
// Fixes: keypad, settings save, Sunmi layout, viewport
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
<script>${SHARED_JS}</script>
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
    var res=await fetch('/voucher',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({amountBtc:btc,amountFiat:a.toFixed(2),currency:S.currency||'EUR',currencySymbol:sym,expiryDays:S.expiryDays||90,storeName:S.storeName||'BOSA'})});
    var d=await res.json();
    if(!d.id)throw new Error(d.error||'No ID returned');
    sessionStorage.setItem('sv_v',JSON.stringify({id:d.id,lnurl:d.lnurl,amountFiat:a.toFixed(2),amountBtc:btc,currency:S.currency||'EUR',currencySymbol:sym,btcPriceAtSale:price,createdAt:new Date().toISOString(),expiryDate:exp.toISOString()}));
    go('/app/confirm');
  }catch(e){
    toast('Error: '+e.message);
    btn.textContent='Print Voucher';btn.disabled=false;
  }
}
</script>
`);

// ── CONFIRM ───────────────────────────────────────────────────

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
    <div class="card" style="display:flex;flex-direction:column;align-items:center;gap:8px">
      <div id="qrw" style="width:160px;height:160px;background:#f8f8f8;border-radius:4px;display:flex;align-items:center;justify-content:center">
        <div class="spin" style="border-top-color:#333;border-color:#ddd"></div>
      </div>
      <div id="vid" class="mono" style="color:#555;font-size:12px;font-weight:700;letter-spacing:2px"></div>
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
    <button class="btn-s" id="nsbtn" style="display:none" onclick="go('/app')">New Sale</button>
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
  QRCode.toCanvas(V.lnurl,{width:160,margin:1,color:{dark:'#000',light:'#fff'}},function(err,canvas){
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
      await doPrint({storeName:S.storeName||'BOSA',headerLine:S.receiptHeader||'',amount:sym+parseFloat(V.amountFiat).toFixed(2),btcAmount:V.amountBtc+' BTC',voucherId:V.id.toUpperCase(),qrData:window.location.origin+'/v/'+V.id,issuedDate:new Date(V.createdAt).toLocaleDateString('en-GB'),expiryDate:new Date(V.expiryDate).toLocaleDateString('en-GB'),footerLine:S.receiptFooter||''});
      toast('Receipt printed');
    }catch(e){toast('Print error: '+e.message);}
  }else{toast('Printer not available');}
  var b=document.getElementById('badge');
  b.textContent='Printed';b.style.borderColor='var(--grn)';b.style.color='var(--grn)';
  btn.textContent='Reprint Receipt';btn.disabled=false;
  document.getElementById('nsbtn').style.display='flex';
}
</script>
`);

// ── HISTORY ───────────────────────────────────────────────────

const HISTORY = page('History', `
<div class="app">
  <div class="hdr">
    <button class="back" onclick="go('/app')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFD000" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
      Back
    </button>
    <div id="logo"></div>
    <div style="width:60px"></div>
  </div>
  <div id="list" class="scroll"></div>
</div>
<script>
document.getElementById('logo').innerHTML=logoHTML();
var S=getSettings();
var SC={active:'var(--grn)',claimed:'#555',expired:'var(--red)'};
var SL={active:'Active',claimed:'Redeemed',expired:'Expired'};
function gsym(v){return v.currencySymbol||(v.currency==='EUR'?'€':v.currency==='GBP'?'£':'$');}
async function load(){
  var el=document.getElementById('list');
  el.innerHTML='<div style="display:flex;justify-content:center;padding:40px"><div class="spin"></div></div>';
  try{
    var r=await fetch('/vouchers');var vs=await r.json();
    if(!vs.length){el.innerHTML='<div style="text-align:center;color:#333;padding:40px">No vouchers yet</div>';return;}
    el.innerHTML=vs.map(function(v){
      var s=gsym(v),col=SC[v.status]||'#555',lbl=SL[v.status]||v.status;
      var dt=v.createdAt?new Date(v.createdAt).toLocaleDateString('en-GB'):'--';
      return '<div class="card">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'+
          '<div><div style="color:#fff;font-size:18px;font-weight:600">'+s+parseFloat(v.amountFiat||0).toFixed(2)+'</div>'+
          '<div class="mono" style="color:#555;font-size:11px;margin-top:1px">'+parseFloat(v.amountBtc||0).toFixed(8)+' BTC</div>'+
          '<div class="mono" style="color:#3a3a3a;font-size:10px;margin-top:2px">'+dt+' . '+(v.id||'').toUpperCase()+'</div></div>'+
          '<span style="padding:3px 9px;border-radius:20px;border:1px solid '+col+';color:'+col+';font-size:10px;font-weight:700">'+lbl+'</span></div>'+
        '<div style="display:flex;gap:7px">'+
          '<button onclick="chk(\''+v.id+'\')" style="flex:1;padding:8px 0;border-radius:9px;border:1px solid var(--gold);background:rgba(255,208,0,.04);color:var(--gold);font-weight:700;font-size:11px;cursor:pointer">Check status</button>'+
          '<button onclick="rep(\''+v.id+'\')" style="flex:1;padding:8px 0;border-radius:9px;border:1px solid var(--bdr);background:none;color:#555;font-weight:700;font-size:11px;cursor:pointer">Reprint</button>'+
        '</div></div>';
    }).join('');
  }catch(e){el.innerHTML='<div style="text-align:center;color:var(--red);padding:40px">'+e.message+'</div>';}
}
async function chk(id){
  try{
    var r=await fetch('/voucher/'+id);var v=await r.json();
    var lbl=SL[v.status]||v.status;
    var msg=id.toUpperCase()+': '+lbl;
    if(v.claimedAt)msg+=' ('+new Date(v.claimedAt).toLocaleDateString('en-GB')+')';
    toast(msg,3500);
  }catch(e){toast('Check failed');}
}
async function rep(id){
  var on=await isBridge();if(!on){toast('Printer not available');return;}
  try{
    var r=await fetch('/voucher/'+id);var v=await r.json();var s=gsym(v);
    await doPrint({storeName:S.storeName||'BOSA',headerLine:S.receiptHeader||'',amount:s+parseFloat(v.amountFiat||0).toFixed(2),btcAmount:parseFloat(v.amountBtc||0).toFixed(8)+' BTC',voucherId:id.toUpperCase(),qrData:window.location.origin+'/v/'+V.id,issuedDate:v.createdAt?new Date(v.createdAt).toLocaleDateString('en-GB'):'',expiryDate:v.expiryDate?new Date(v.expiryDate).toLocaleDateString('en-GB'):'',footerLine:S.receiptFooter||''});
    toast('Reprinted');
  }catch(e){toast('Reprint failed: '+e.message);}
}
load();
</script>
`);

// ── SETTINGS ──────────────────────────────────────────────────

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
</script>
`);

// ============================================================
// BECH32 + BLINK — unchanged from your working version
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

        // Web app
        if (path === "" || path === "/app")  return new Response(SALE,     { headers: hh });
        if (path === "/app/confirm")          return new Response(CONFIRM,  { headers: hh });
        if (path === "/app/history")          return new Response(HISTORY,  { headers: hh });
        if (path === "/app/settings")         return new Response(SETTINGS, { headers: hh });

        // Treasury
        if (path === "/treasury" && request.method === "GET") {
            const r = await fetch("https://api.blink.sv/graphql", {
                method:"POST", headers:{"X-API-KEY":env.BLINK_API_KEY.trim(),"Content-Type":"application/json"},
                body: JSON.stringify({query:`query{me{defaultAccount{walletById(walletId:"${env.BLINK_WALLET_ID}"){balance}}}}`})
            });
            const d = await r.json();
            return new Response(JSON.stringify({balance:d.data?.me?.defaultAccount?.walletById?.balance||0}),{headers:jh});
        }

        // Voucher list
        if (path === "/vouchers" && request.method === "GET") {
            try {
                const list = await env.VOUCHERS.list({ prefix:"voucher:", limit:50 });
                const items = await Promise.all(list.keys.map(async k => {
                    const v = await env.VOUCHERS.get(k.name); return v ? JSON.parse(v) : null;
                }));
                const results = items.filter(Boolean).sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
                return new Response(JSON.stringify(results), {headers:jh});
            } catch(e) { return new Response(JSON.stringify({error:e.message}),{status:500,headers:jh}); }
        }

        // Single voucher
        if (path.startsWith("/voucher/") && request.method === "GET") {
            const id = path.split("/")[2];
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response(JSON.stringify({error:"Not Found"}),{status:404,headers:jh});
            return new Response(raw, {headers:jh});
        }

        // Create voucher
        if (path === "/voucher" && request.method === "POST") {
            const body = await request.json();
            const id = (body.id || Math.random().toString(36).substring(2,8)).toLowerCase();
            const cleanBtc = parseFloat(body.amountBtc).toFixed(8);
            const lnurl = encodeBech32("lnurl", `https://${url.host}/lnurlw/${id}`).toUpperCase();
            const data = { ...body, amountBtc:cleanBtc, id, k1:Math.random().toString(36).substring(2,15), status:"active", createdAt:new Date().toISOString() };
            await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(data));
            return new Response(JSON.stringify({status:"OK",id,lnurl}),{headers:jh});
        }

        // LNURL step 1
        if (path.startsWith("/lnurlw/") && !path.includes("callback")) {
            const id = path.split("/")[2];
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response("Not Found",{status:404});
            const v = JSON.parse(raw);
            const msats = Math.floor(parseFloat(v.amountBtc) * 100_000_000 * 1000);
            return new Response(JSON.stringify({tag:"withdrawRequest",callback:`${url.origin}/lnurlw/callback/${id}`,k1:v.k1,defaultDescription:`Voucher ${id}`,minWithdrawable:msats,maxWithdrawable:msats}),{headers:jh});
        }

        // LNURL step 2
        if (path.startsWith("/lnurlw/callback/")) {
            const id = path.split("/")[3];
            const pr = url.searchParams.get("pr");
            const raw = await env.VOUCHERS.get(`voucher:${id}`);
            if (!raw) return new Response("Not Found",{status:404});
            const v = JSON.parse(raw);
            if (v.status==="claimed") return new Response(JSON.stringify({status:"ERROR",reason:"Already claimed"}),{headers:jh});
            try {
                await payInvoice(pr, env.BLINK_WALLET_ID, env.BLINK_API_KEY);
                v.status="claimed"; v.claimedAt=new Date().toISOString();
                await env.VOUCHERS.put(`voucher:${id}`, JSON.stringify(v));
                return new Response(JSON.stringify({status:"OK"}),{headers:jh});
            } catch(e) {
                return new Response(JSON.stringify({status:"ERROR",reason:e.message}),{status:500,headers:jh});
            }
        }
if (path.startsWith("/v/")) {
    const id = path.split("/")[2];
    const raw = await env.VOUCHERS.get(`voucher:${id}`);
    if (!raw) return new Response(
        `<html><body style="font-family:sans-serif;padding:40px;background:#111;color:#fff"><h2>Voucher not found</h2></body></html>`,
        { headers: {"Content-Type":"text/html"} }
    );
    const v = JSON.parse(raw);
    const sym = v.currencySymbol||(v.currency==='EUR'?'€':v.currency==='GBP'?'£':'$');
    const sc = v.status==='active'?'#00cc55':v.status==='claimed'?'#888':'#ff4444';
    const sl = v.status==='active'?'Active — ready to redeem':v.status==='claimed'?'Already redeemed':'Expired';
    return new Response(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voucher ${id.toUpperCase()}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{background:#080808;color:#f0f0f0;font-family:'Helvetica Neue',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:#111;border-radius:20px;border:1px solid #222;padding:32px;max-width:380px;width:100%;text-align:center}
.logo{font-size:13px;font-weight:700;letter-spacing:3px;color:#FFD000;text-transform:uppercase;margin-bottom:24px}
.amount{font-size:52px;font-weight:200;color:#FFD000;line-height:1}
.btc{font-size:16px;color:#666;margin-top:6px;font-family:monospace}
hr{border:none;border-top:1px solid #222;margin:20px 0}
.badge{display:inline-block;padding:6px 18px;border-radius:20px;border:1px solid ${sc};color:${sc};font-size:13px;font-weight:700;margin-bottom:20px}
.row{display:flex;justify-content:space-between;margin-bottom:10px;font-size:14px}
.lbl{color:#555}.val{color:#ccc;font-weight:600}
.btn{display:block;margin-top:24px;padding:16px;background:#FFD000;border-radius:14px;color:#0a0a0a;font-weight:800;font-size:16px;text-decoration:none}
.btn.off{background:#1c1c00;color:#3a3a00;pointer-events:none}
</style></head><body>
<div class="card">
<div class="logo">Sats VOUCHER</div>
<div class="amount">${sym}${parseFloat(v.amountFiat||0).toFixed(2)}</div>
<div class="btc">${parseFloat(v.amountBtc||0).toFixed(8)} BTC</div>
<hr>
<div class="badge">${sl}</div>
<div class="row"><span class="lbl">Voucher ID</span><span class="val" style="font-family:monospace">${id.toUpperCase()}</span></div>
<div class="row"><span class="lbl">Issued</span><span class="val">${new Date(v.createdAt).toLocaleDateString('en-GB')}</span></div>
<div class="row"><span class="lbl">Expires</span><span class="val">${v.expiryDate?new Date(v.expiryDate).toLocaleDateString('en-GB'):'—'}</span></div>
${v.status==='active'?`<a href="lightning:${v.lnurl}" class="btn">Redeem with Lightning</a><p style="color:#444;font-size:11px;margin-top:10px">Opens your Lightning wallet to claim ${sym}${parseFloat(v.amountFiat||0).toFixed(2)}</p>`:`<div class="btn off">${v.status==='claimed'?'Already redeemed':'Expired'}</div>`}
</div></body></html>`, { headers: {"Content-Type":"text/html;charset=UTF-8"} });
}

        return new Response(`Not found: ${path}`,{status:404});
    }
};
