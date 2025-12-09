// script.js (user page) — DIRECT CONNECTION VERSION (NO PROXY)

// Products (fixed)
const PRODUCTS = [
  { id:'yklt_ori', name:'Yakult Original', pack:10000, pallet:100000, img:'img/yklt-ori.png' },
  { id:'yklt_mango', name:'Yakult Mangga', pack:10000, pallet:100000, img:'img/yklt-mangga.png' },
  { id:'yklt_light', name:'Yakult Light', pack:12500, pallet:125000, img:'img/yklt-light.png' },
  { id:'open_Donasi', name:'Open Donasi', pack:1000, pallet:1000, img:'img/open-Donasu.png' }
];

// NOTE: QRIS_STATIS kept for legacy structure.
const QRIS_STATIS = "00020101021126570011ID.DANA.WWW011893600915380003780002098000378000303UMI51440014ID.CO.QRIS.WWW0215ID10243620012490303UMI5204549953033605802ID5910Warr2 Shop6015Kab. Bandung Ba6105402936304BF4C";

let CART = {};
let lastTx = null;

// --- ARIEPULSA API CONFIGURATION (DIRECT) ---
// LOGIKA: Menggunakan URL langsung. Jika Vercel memblokir karena Mixed Content,
// pastikan API mendukung HTTPS (ariepulsa.my.id sudah https).
const API_URL = "https://ariepulsa.my.id/api/qrisrealtime";
const API_KEY = "Q1yAmTLnVqfmcVbZW8gYiDeu15WKTNf4"; // Key ditaruh di client karena tanpa proxy backend
let kodeDeposit = null;
let autoCheckInterval = null;
let countdownTimer = null;
const COUNTDOWN_DURATION = 180; // 3 menit
// ---------------------------------------------


/* ---------------- UI: products & cart ---------------- */
function renderProducts(){
  const grid = document.getElementById('productGrid');
  if(!grid) return;
  grid.innerHTML = '';
  PRODUCTS.forEach(p=>{
    const node = document.createElement('div'); node.className='product';
    node.innerHTML = `
      <img src="${p.img}" alt="${p.name}">
      <h3>${p.name}</h3>
      <div class="small">Pack: ${formatRp(p.pack)} • Bal: ${formatRp(p.pallet)}</div>
      <div class="counter">
        <button class="btn ghost" data-id="${p.id}" data-op="dec">−</button>
        <div class="qty-box qty-${p.id}">0</div>
        <button class="btn primary" data-id="${p.id}" data-op="inc">+</button>
      </div>
    `;
    grid.appendChild(node);
  });
  grid.querySelectorAll('[data-op]').forEach(b=> b.addEventListener('click', e=>{
    const id = e.currentTarget.dataset.id; const op = e.currentTarget.dataset.op;
    changeQty(id, op==='inc'?1:-1);
  }));
}

function changeQty(id, delta){
  if(!CART[id]) CART[id]=0;
  CART[id] = Math.max(0, CART[id] + delta);
  const el = document.querySelector('.qty-'+id);
  if(el) el.textContent = CART[id];
  updateCart();
}

function updateCart(){
  const list = document.getElementById('cartList'); if(!list) return;
  list.innerHTML='';
  const keys = Object.keys(CART).filter(k=>CART[k]>0);
  if(keys.length===0){ list.innerHTML = '<div class="muted">Troli kosong</div>'; const ta = document.getElementById('totalAmount'); if(ta) ta.textContent = formatRp(0); return; }
  let total = 0;
  keys.forEach(k=>{
    const p = PRODUCTS.find(x=>x.id===k);
    const qty = CART[k];
    const sub = qty * p.pack;
    total += sub;
    const item = document.createElement('div'); item.className='cart-item';
    item.innerHTML = `<div><strong>${p.name}</strong><div class="small">${qty} x ${formatRp(p.pack)}</div></div>
                      <div style="display:flex;align-items:center;gap:8px"><div style="font-weight:900">${formatRp(sub)}</div><button class="btn ghost" data-rm="${k}">✕</button></div>`;
    list.appendChild(item);
  });
  const ta = document.getElementById('totalAmount'); if(ta) ta.textContent = formatRp(total);
  list.querySelectorAll('[data-rm]').forEach(b=> b.addEventListener('click', e=>{
    const id = e.currentTarget.dataset.rm; delete CART[id]; const qel = document.querySelector('.qty-'+id); if(qel) qel.textContent = 0; updateCart();
  }));
  return total; // Return subtotal
}

function calculateTotal(cartItems){
  let total = 0;
  Object.keys(cartItems).filter(k=>cartItems[k]>0).forEach(k=>{
    const p = PRODUCTS.find(x=>x.id===k);
    total += cartItems[k] * p.pack;
  });
  return total;
}

const resetBtn = document.getElementById('resetCart');
if(resetBtn) resetBtn.addEventListener('click', ()=> {
  if(!confirm('Reset troli?')) return;
  CART={}; document.querySelectorAll('[class^="qty-"]').forEach(el=>el.textContent='0'); updateCart();
});

/* Payment buttons */
const payQrBtn = document.getElementById('payQrBtn');
const payCashBtn = document.getElementById('payCashBtn');
if(payQrBtn) payQrBtn.addEventListener('click', ()=> startQrisWorkflow());
if(payCashBtn) payCashBtn.addEventListener('click', ()=> startOrder('cash'));

/* hide QR button */
const hideQRBtn = document.getElementById('hideQR');
if(hideQRBtn) hideQRBtn.addEventListener('click', ()=> endQrisFlow('hide'));


/* ---------------- LOGIKA "ANTI GAGAL" QRIS (FormData Direct) ---------------- */

function startQrisWorkflow(){
  const subTotal = calculateTotal(CART);
  if(Object.keys(CART).filter(k=>CART[k]>0).length===0){ alert('Troli kosong'); return; }
  
  const qrBox = document.getElementById('qrBox');
  const qrImage = document.getElementById('qrImage');
  const qrInfo = document.getElementById('qrInfo');
  const downloadBtn = document.getElementById('downloadQR');
  
  if(qrBox) qrBox.classList.remove('hidden');
  if(qrImage) qrImage.innerHTML = `<div style="text-align:center;padding:20px"><p>Menghubungkan ke server...</p></div>`;
  if(qrInfo) qrInfo.textContent = 'Meminta QRIS...';
  if(downloadBtn) downloadBtn.style.display='none';
  
  const actionsDiv = document.querySelector('.actions');
  if(actionsDiv) actionsDiv.style.display='none';
  
  if(kodeDeposit){
      alert('Transaksi QRIS sebelumnya masih aktif.');
      if(qrBox) qrBox.classList.add('hidden');
      if(actionsDiv) actionsDiv.style.display='flex';
      return;
  }
  
  callAriepulsaDeposit(subTotal);
}

// 1. Panggil API Ariepulsa (DIRECT via FormData)
async function callAriepulsaDeposit(subTotal){
  const txid = createTxId();
  lastTx = txid;
  
  const qrBox = document.getElementById('qrBox'); 
  const qrImage = document.getElementById('qrImage'); 
  const qrInfo = document.getElementById('qrInfo');

  // LOGIKA: Gunakan FormData. Ini memicu browser mengirim 'multipart/form-data'
  // Server PHP biasanya lebih suka ini daripada JSON, dan browser lebih santai soal CORS.
  const form = new FormData();
  form.append("api_key", API_KEY);
  form.append("action", "get-deposit");
  form.append("jumlah", subTotal);
  form.append("reff_id", txid);
  form.append("kode_channel", "QRISREALTIME");
  
  try {
      // Fetch langsung ke URL eksternal
      const req = await fetch(API_URL, { 
          method: "POST", 
          body: form // Jangan set 'Content-Type' header, biarkan browser yang atur boundary
      });
      
      const res = await req.json(); // Parse response JSON
      
      if(res.status && res.data){ 
          const data = res.data;
          kodeDeposit = data.kode_deposit; 

          const detailHtml = `
              <div style="padding:15px;text-align:left;line-height:1.6">
                <div style="font-size:16px;font-weight:700">Detail Pembayaran QRIS</div>
                <div style="border-top:1px dashed #ddd;margin:8px 0"></div>
                <div>Subtotal: <span style="float:right">${formatRp(data.nominal)}</span></div>
                <div>**Biaya Layanan:** <span style="float:right">${formatRp(data.fee)}</span></div>
                <div style="border-top:1px solid #ddd;margin:8px 0"></div>
                <div style="font-size:18px;font-weight:900;color:var(--primary)">TOTAL BAYAR: <span style="float:right">${formatRp(data.jumlah_transfer)}</span></div>
                <div style="margin-top:10px;text-align:center">
                  <button id="confirmQrisBtn" class="btn primary">LANJUTKAN KE QRIS</button>
                  <button id="cancelQrisBtn" class="btn ghost" style="margin-left:8px">BATAL</button>
                </div>
              </div>
          `;
          
          if(qrImage) qrImage.innerHTML = detailHtml;
          if(qrInfo) qrInfo.textContent = 'Harap konfirmasi jumlah bayar.';
          
          document.getElementById('confirmQrisBtn').onclick = () => {
            displayQrisAndStartFlow(data, subTotal, txid);
          };
          
          document.getElementById('cancelQrisBtn').onclick = () => {
              cancelDeposit(false, true); 
          };

      } else { 
          alert('Gagal: ' + (res.data?.pesan || res.pesan || 'Unknown error'));
          endQrisFlow('error');
      }
      
  } catch(err){
      console.error(err);
      alert('Koneksi Gagal (Mungkin CORS atau Jaringan): ' + (err.message || err));
      endQrisFlow('error');
  }
}

// 2. Tampilkan QRIS
async function displayQrisAndStartFlow(data, subTotal, txid){
    const qrImage = document.getElementById('qrImage'); 
    const qrInfo = document.getElementById('qrInfo');
    
    replacePayButtonWithCountdown();
    
    if(qrImage) qrImage.innerHTML = `<img src="${data.link_qr}" alt="QRIS">`;
    if(qrInfo) qrInfo.textContent = `Kode: ${data.kode_deposit} | Bayar: ${formatRp(data.jumlah_transfer)}`;
    
    // Save to Firebase
    const items = getCartItems();
    const orderTemplate = { 
        txid, 
        amount: data.jumlah_transfer, 
        sub_total: subTotal,
        qris_fee: data.fee,
        kode_deposit: data.kode_deposit,
        qris_url: data.link_qr,
        items, 
        status:'pending', 
        method_choice: 'qris', 
        created_at: Date.now() 
    };
    
    try {
        if(typeof DB !== 'undefined' && DB.ref) await DB.ref('orders/'+txid).set(orderTemplate);
    } catch(e){
        console.error('Firebase Error', e);
    }

    startCountdown(COUNTDOWN_DURATION, data.kode_deposit); 
    mulaiAutoCek(data.kode_deposit); 
    
    const downloadBtn = document.getElementById('downloadQR');
    if(downloadBtn) {
        downloadBtn.style.display = 'inline-block';
        downloadBtn.onclick = (e)=>{
            const a = document.createElement('a');
            a.href = data.link_qr;
            a.download = txid + ".png";
            a.click();
        };
    }
}

function getCartItems(){
    const keys = Object.keys(CART).filter(k=>CART[k]>0);
    const items=[];
    keys.forEach(k=>{
        const p = PRODUCTS.find(x=>x.id===k);
        items.push({ id:p.id, name:p.name, qty:CART[k], packPrice:p.pack });
    });
    return items;
}

/* ---------------- COUNTDOWN ---------------- */

function replacePayButtonWithCountdown(){
    const actionsDiv = document.querySelector('.actions');
    if(actionsDiv) actionsDiv.style.display='none';
    const payQrBtn = document.getElementById('payQrBtn');
    
    let timerDisplay = document.getElementById('qrisCountdown');
    if (!timerDisplay) {
        timerDisplay = document.createElement('div');
        timerDisplay.id = 'qrisCountdown';
        timerDisplay.className = 'btn primary countdown-display'; 
        if(payQrBtn) payQrBtn.parentNode.insertBefore(timerDisplay, payQrBtn);
    }
    payQrBtn.style.display = 'none';
    if(document.getElementById('payCashBtn')) document.getElementById('payCashBtn').style.display = 'none'; 
}

function startCountdown(duration, depositId){
    let remaining = duration;
    const display = document.getElementById('qrisCountdown');
    if (countdownTimer) clearInterval(countdownTimer); 

    countdownTimer = setInterval(() => {
        const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
        const seconds = String(remaining % 60).padStart(2, '0');
        
        if (display) display.textContent = `Waktu Tersisa: ${minutes}:${seconds}`;

        if (--remaining < 0) {
            clearInterval(countdownTimer);
            cancelDeposit(true);
        }
    }, 1000);
}


/* ---------------- AUTO CEK & CANCEL (Direct FormData) ---------------- */

async function cekStatus(depoId = kodeDeposit){
    if(!depoId){ stopAutoCek(); return; }
    
    // Gunakan FormData untuk cek status
    const form = new FormData();
    form.append("api_key", API_KEY);
    form.append("action", "status-deposit");
    form.append("kode_deposit", depoId);
    
    try {
        const req = await fetch(API_URL, { method:"POST", body:form });
        const res = await req.json();

        const statusBox = document.getElementById("qrInfo");
        
        if(res.status && res.data){ 
            const status = res.data.status;
            if(statusBox) statusBox.textContent = `Status: ${status} | Kode: ${depoId}`;
            
            if(status === "Success"){ 
                endQrisFlow('paid', depoId);
            } else if(status === "Error" || status === "Expired"){ 
                endQrisFlow('cancelled', depoId); 
            }
        } else {
             if(statusBox) statusBox.textContent = `Cek Gagal: ${res.data?.pesan || res.pesan || 'Error API'}`;
        }
    } catch(err) {
        console.error('Cek status error:', err);
    }
}

function mulaiAutoCek(depoId){
    stopAutoCek();
    autoCheckInterval = setInterval(() => cekStatus(depoId), 5000); 
}

function stopAutoCek(){
    if(autoCheckInterval) clearInterval(autoCheckInterval);
}

async function cancelDeposit(isAuto = false, isLocalOnly = false){
    if(isLocalOnly){
        kodeDeposit = null;
        return endQrisFlow('cancelled'); 
    }
    
    if(!kodeDeposit) return endQrisFlow('cancelled');

    // Gunakan FormData untuk cancel
    const form = new FormData();
    form.append("api_key", API_KEY);
    form.append("action", "cancel-deposit");
    form.append("kode_deposit", kodeDeposit);

    try {
        const req = await fetch(API_URL, { method:"POST", body:form });
        const res = await req.json();
        
        if(res.status){ 
            if(isAuto) alert('Waktu habis.');
            else alert('Dibatalkan.');
            endQrisFlow('cancelled', kodeDeposit);
        } else {
             endQrisFlow('cancelled'); 
        }
    } catch(e){
        console.error(e);
        endQrisFlow('cancelled');
    }
}

function endQrisFlow(status = 'default', depoId = null){
    if (countdownTimer) clearInterval(countdownTimer);
    stopAutoCek();
    kodeDeposit = null;
    lastTx = null;
    
    const qrBox = document.getElementById('qrBox'); 
    const qrImage = document.getElementById('qrImage'); 
    const qrInfo = document.getElementById('qrInfo');
    const timerDisplay = document.getElementById('qrisCountdown');
    const actionsDiv = document.querySelector('.actions');
    const payQrBtn = document.getElementById('payQrBtn');
    
    if(qrBox) qrBox.classList.add('hidden');
    if(timerDisplay) timerDisplay.remove();
    
    if(payQrBtn) payQrBtn.style.display = 'inline-block';
    if(document.getElementById('payCashBtn')) document.getElementById('payCashBtn').style.display = 'inline-block';
    if(actionsDiv) actionsDiv.style.display='flex';
    
    if(status === 'paid'){
        const successAnim = document.createElement('div');
        successAnim.id = 'successAnimation';
        successAnim.innerHTML = `<div style="text-align:center;padding:20px;margin-top:12px"><span style="font-size:48px;color:var(--success)">✅</span><p style="font-weight:700;color:var(--success)">Lunas!</p></div>`;
        
        if(depoId && typeof DB !== 'undefined' && DB.ref) {
            DB.ref('orders').orderByChild('kode_deposit').equalTo(depoId).once('child_added', snap=>{
                snap.ref.update({ status: 'paid', paid_at: Date.now(), payment_method: 'QRIS' });
            });
        }
        
        if(actionsDiv && actionsDiv.parentNode) actionsDiv.parentNode.insertBefore(successAnim, actionsDiv.nextSibling);
        setTimeout(()=> document.getElementById('successAnimation')?.remove(), 5000);
        CART={}; document.querySelectorAll('[class^="qty-"]').forEach(el=>el.textContent='0'); updateCart();

    } else if (status === 'cancelled'){
        if(depoId && typeof DB !== 'undefined' && DB.ref) {
            DB.ref('orders').orderByChild('kode_deposit').equalTo(depoId).once('child_added', snap=>{
                if(snap.val().status === 'pending'){
                    snap.ref.update({ status: 'cancelled', cancelled_at: Date.now() });
                }
            });
        }
    }
    
    if(status !== 'hide') {
        if(qrImage) qrImage.innerHTML = ''; 
        if(qrInfo) qrInfo.textContent = ''; 
    }
}

/* ---------------- startOrder: CASH flow ---------------- */
async function startOrder(method){
  const keys = Object.keys(CART).filter(k=>CART[k]>0);
  if(keys.length===0){ alert('Troli kosong'); return; }
  let total = 0; const items=[];
  keys.forEach(k=>{
    const p = PRODUCTS.find(x=>x.id===k);
    items.push({ id:p.id, name:p.name, qty:CART[k], packPrice:p.pack });
    total += CART[k] * p.pack;
  });

  const txid = createTxId();
  lastTx = txid;

  const qrBox = document.getElementById('qrBox'); 
  const qrImage = document.getElementById('qrImage'); 
  if(document.getElementById('qrInfo')) document.getElementById('qrInfo').textContent = 'Membuat transaksi...'; 
  if(qrBox) qrBox.classList.remove('hidden');

  const orderTemplate = { txid, amount: total, items, status:'pending', method_choice: method, created_at: Date.now() };

  try {
    if(typeof DB !== 'undefined' && DB.ref) await DB.ref('orders/'+txid).set(orderTemplate);

    if(method === 'cash'){
      if(document.getElementById('qrImage')) document.getElementById('qrImage').innerHTML = `<div class="small muted">Transaksi cash dicatat. Bayar tunai ke admin.</div>`;
      if(typeof DB !== 'undefined' && DB.ref) {
        await DB.ref('orders/'+txid).update({ via:'cash' });
      }
      if(document.getElementById('qrInfo')) document.getElementById('qrInfo').textContent = `Kode: ${txid} (CASH)`;
    }
    
    CART={}; document.querySelectorAll('[class^="qty-"]').forEach(el=>el.textContent='0'); updateCart();
    alert('Order dibuat. Kode: ' + txid);

    if(typeof DB !== 'undefined' && DB.ref) {
      DB.ref('orders/'+txid+'/status').on('value', snap=>{
        const s = snap.val();
        if(s === 'paid'){
          if(qrBox) qrBox.classList.add('hidden');
          alert('Pembayaran terkonfirmasi.');
          DB.ref('orders/'+txid+'/status').off('value'); 
        } else if(s === 'cancelled'){
          if(qrBox) qrBox.classList.add('hidden');
          alert('Transaksi dibatalkan.');
          DB.ref('orders/'+txid+'/status').off('value');
        }
      });
    }

  } catch(err){
    console.error(err);
    alert('Gagal: ' + err.message);
  }
}

/* ---------------- utilities ---------------- */
function createTxId(){
  const d = new Date();
  return 'YKLT' + d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}
function formatRp(n){ return 'Rp' + Number(n||0).toLocaleString('id-ID'); }
function pad2(n){ return String(n).padStart(2,'0'); }

/* ---------------- history & init ---------------- */
function renderUserHistoryFromOrders(snapshotVal){
  const historyEl = document.getElementById('historyList');
  if(!historyEl) return;
  historyEl.innerHTML = '';
  if(!snapshotVal){ historyEl.innerHTML = '<div class="muted">Belum ada riwayat</div>'; return; }
  const arr = Object.values(snapshotVal).filter(o=>o.status === 'paid').sort((a,b)=> (b.paid_at || 0) - (a.paid_at || 0));
  if(arr.length === 0){ historyEl.innerHTML = '<div class="muted">Belum ada riwayat</div>'; return; }
  arr.slice(0,8).forEach(o=>{
    const node = document.createElement('div'); node.className = 'card';
    const time = o.paid_at ? new Date(o.paid_at).toLocaleString() : '-';
    node.style.padding='10px'; node.style.marginBottom='8px';
    node.innerHTML = `<div style="display:flex;justify-content:space-between"><div><strong>${o.txid}</strong><div class="small">${time}</div></div><div style="font-weight:900">${formatRp(o.amount)}</div></div>`;
    historyEl.appendChild(node);
  });
}

if(typeof DB !== 'undefined' && DB.ref){
  DB.ref('orders').on('value', snap=>{ renderUserHistoryFromOrders(snap.val()||{}); });
}

renderProducts();
updateCart();
startClock();
