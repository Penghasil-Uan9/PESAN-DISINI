// script.js (user page) — DIRECT CONNECTION & LOCAL QR GENERATOR

// Products (fixed)
const PRODUCTS = [
  { id:'yklt_ori', name:'Yakult Original', pack:10000, pallet:100000, img:'img/yklt-ori.png' },
  { id:'yklt_mango', name:'Yakult Mangga', pack:10000, pallet:100000, img:'img/yklt-mangga.png' },
  { id:'yklt_light', name:'Yakult Light', pack:12500, pallet:125000, img:'img/yklt-light.png' },
  { id:'open_Donasi', name:'Open Donasi', pack:1000, pallet:1000, img:'img/open-Donasu.png' }
];

let CART = {};
let lastTx = null;

// --- CONFIGURATION ---
// LOGIKA 1: Gunakan URL Langsung (HTTPS). Browser modern akan mengizinkan ini jika server API mendukungnya.
const API_URL = "https://ariepulsa.my.id/api/qrisrealtime";
// Key ditaruh di sini karena kita tidak pakai backend proxy
const API_KEY = "Q1yAmTLnVqfmcVbZW8gYiDeu15WKTNf4"; 

let kodeDeposit = null;
let autoCheckInterval = null;
let countdownTimer = null;
const COUNTDOWN_DURATION = 180; // 3 menit
// ---------------------


/* ---------------- UI & CART FUNCTIONS ---------------- */
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

const payQrBtn = document.getElementById('payQrBtn');
const payCashBtn = document.getElementById('payCashBtn');
if(payQrBtn) payQrBtn.addEventListener('click', ()=> startQrisWorkflow());
if(payCashBtn) payCashBtn.addEventListener('click', ()=> startOrder('cash'));

const hideQRBtn = document.getElementById('hideQR');
if(hideQRBtn) hideQRBtn.addEventListener('click', ()=> endQrisFlow('hide'));


/* ---------------- LOGIKA UTAMA (ANTI GAGAL) ---------------- */

function startQrisWorkflow(){
  const subTotal = calculateTotal(CART);
  if(Object.keys(CART).filter(k=>CART[k]>0).length===0){ alert('Troli kosong'); return; }
  
  const qrBox = document.getElementById('qrBox');
  const qrImage = document.getElementById('qrImage');
  const qrInfo = document.getElementById('qrInfo');
  const downloadBtn = document.getElementById('downloadQR');
  
  if(qrBox) qrBox.classList.remove('hidden');
  // Bersihkan area gambar saat loading
  if(qrImage) qrImage.innerHTML = `<div style="padding:20px; text-align:center;">⏳ Menghubungkan...</div>`;
  if(qrInfo) qrInfo.textContent = 'Meminta data QRIS...';
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

// 1. REQUEST DATA KE API (Metode Direct FormData)
async function callAriepulsaDeposit(subTotal){
  const txid = createTxId();
  lastTx = txid;
  
  const qrImage = document.getElementById('qrImage'); 
  const qrInfo = document.getElementById('qrInfo');

  // LOGIKA 2: Gunakan FormData. Ini membuat request terlihat seperti submit form HTML biasa.
  // Browser menangani Boundary dan Headers otomatis. Server PHP biasanya menerimanya dengan baik.
  const form = new FormData();
  form.append("api_key", API_KEY);
  form.append("action", "get-deposit");
  form.append("jumlah", subTotal);
  form.append("reff_id", txid);
  form.append("kode_channel", "QRISREALTIME");
  
  try {
      // Fetch LANGSUNG ke URL API (Tanpa Proxy Vercel)
      const req = await fetch(API_URL, { 
          method: "POST", 
          body: form // Jangan tambahkan header Content-Type!
      });
      
      const res = await req.json();
      
      if(res.status && res.data){ 
          const data = res.data;
          kodeDeposit = data.kode_deposit; 

          // Tampilkan Rincian Sebelum QR Muncul
          const detailHtml = `
              <div style="padding:15px;text-align:left;line-height:1.6">
                <div style="font-size:16px;font-weight:700">Konfirmasi Pembayaran</div>
                <div style="border-top:1px dashed #ddd;margin:8px 0"></div>
                <div>Harga Produk: <span style="float:right">${formatRp(data.nominal)}</span></div>
                <div>Biaya Admin: <span style="float:right">${formatRp(data.fee)}</span></div>
                <div style="border-top:1px solid #ddd;margin:8px 0"></div>
                <div style="font-size:18px;font-weight:900;color:var(--primary)">TOTAL: <span style="float:right">${formatRp(data.jumlah_transfer)}</span></div>
                <div style="margin-top:10px;text-align:center">
                  <button id="confirmQrisBtn" class="btn primary">TAMPILKAN QRIS</button>
                  <button id="cancelQrisBtn" class="btn ghost" style="margin-left:8px">BATAL</button>
                </div>
              </div>
          `;
          
          if(qrImage) qrImage.innerHTML = detailHtml;
          if(qrInfo) qrInfo.textContent = 'Menunggu konfirmasi Anda...';
          
          document.getElementById('confirmQrisBtn').onclick = () => {
            displayQrisAndStartFlow(data, subTotal, txid);
          };
          
          document.getElementById('cancelQrisBtn').onclick = () => {
              cancelDeposit(false, true); 
          };

      } else { 
          // Handle jika API menolak (misal saldo habis atau maintenance)
          alert('Gagal: ' + (res.data?.pesan || res.pesan || 'Unknown error'));
          endQrisFlow('error');
      }
      
  } catch(err){
      console.error(err);
      alert('Koneksi Gagal. Cek internet atau coba lagi nanti. (' + err.message + ')');
      endQrisFlow('error');
  }
}

// 2. GENERATE GAMBAR QRIS SECARA LOKAL (LOGIKA 3)
async function displayQrisAndStartFlow(data, subTotal, txid){
    const qrImage = document.getElementById('qrImage'); 
    const qrInfo = document.getElementById('qrInfo');
    
    // Ganti tombol bayar dengan Timer
    replacePayButtonWithCountdown();
    
    // LOGIKA 3: Jangan pakai tag <img> ke URL luar.
    // Kita bersihkan container, lalu suruh script membuat gambar QR baru di situ.
    if(qrImage) {
        qrImage.innerHTML = ''; // Hapus teks loading/konfirmasi
        qrImage.style.display = 'flex';
        qrImage.style.justifyContent = 'center';
        qrImage.style.marginBottom = '15px';
        
        // Ambil data mentah QR. Jika API kasih 'qr_content' atau 'qr_string', pakai itu.
        // Jika cuma ada 'link_qr', kita jadikan link itu sebagai isi QR.
        const qrContent = data.qr_content || data.qr_string || data.link_qr;

        // Generate QR Code menggunakan Library
        new QRCode(qrImage, {
            text: qrContent,
            width: 220,
            height: 220,
            colorDark : "#000000",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.M
        });
    }

    if(qrInfo) qrInfo.textContent = `Scan QR di atas • ${data.kode_deposit}`;
    
    // Simpan Order ke Firebase (Pending)
    const items = getCartItems();
    const orderTemplate = { 
        txid, 
        amount: data.jumlah_transfer, 
        sub_total: subTotal,
        qris_fee: data.fee,
        kode_deposit: data.kode_deposit,
        qris_url: data.link_qr, // Masih simpan link asli untuk admin/backup
        items, 
        status:'pending', 
        method_choice: 'qris', 
        created_at: Date.now() 
    };
    
    try {
        if(typeof DB !== 'undefined' && DB.ref) await DB.ref('orders/'+txid).set(orderTemplate);
    } catch(e){ console.error('Firebase Error', e); }

    // Mulai Timer & Pengecekan Status Otomatis
    startCountdown(COUNTDOWN_DURATION, data.kode_deposit); 
    mulaiAutoCek(data.kode_deposit); 
    
    // Tombol Download (Optional)
    const downloadBtn = document.getElementById('downloadQR');
    if(downloadBtn) {
        downloadBtn.style.display = 'inline-block';
        downloadBtn.onclick = (e)=>{
            const a = document.createElement('a');
            a.href = data.link_qr;
            a.download = txid + ".png";
            a.target = "_blank"; // Buka di tab baru agar aman
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
    // Update tampilan awal timer
    timerDisplay.textContent = "Menyiapkan Waktu...";
    
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
        
        if (display) display.textContent = `Sisa Waktu: ${minutes}:${seconds}`;

        if (--remaining < 0) {
            clearInterval(countdownTimer);
            if(display) display.textContent = "Waktu Habis";
            cancelDeposit(true);
        }
    }, 1000);
}


/* ---------------- AUTO CEK & CANCEL ---------------- */

async function cekStatus(depoId = kodeDeposit){
    if(!depoId){ stopAutoCek(); return; }
    
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
            // Update info status kecil di bawah QR
            if(statusBox) statusBox.textContent = `Status: ${status} | Kode: ${depoId}`;
            
            if(status === "Success"){ 
                endQrisFlow('paid', depoId);
            } else if(status === "Error" || status === "Expired"){ 
                endQrisFlow('cancelled', depoId); 
            }
        }
    } catch(err) {
        console.error('AutoCheck Error (diabaikan):', err);
    }
}

function mulaiAutoCek(depoId){
    stopAutoCek();
    // Cek setiap 5 detik
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

    const form = new FormData();
    form.append("api_key", API_KEY);
    form.append("action", "cancel-deposit");
    form.append("kode_deposit", kodeDeposit);

    try {
        // Kirim request cancel, tapi jangan tunggu terlalu lama untuk update UI
        fetch(API_URL, { method:"POST", body:form }).catch(e => console.log(e));
        
        if(isAuto) alert('Waktu pembayaran habis.');
        else alert('Transaksi dibatalkan.');
        
        endQrisFlow('cancelled', kodeDeposit);
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
    
    // Sembunyikan Area QR
    if(qrBox) qrBox.classList.add('hidden');
    if(timerDisplay) timerDisplay.remove();
    
    // Kembalikan Tombol
    if(payQrBtn) payQrBtn.style.display = 'inline-block';
    if(document.getElementById('payCashBtn')) document.getElementById('payCashBtn').style.display = 'inline-block';
    if(actionsDiv) actionsDiv.style.display='flex';
    
    // Reset Style QR Image (karena tadi diubah jadi flex)
    if(qrImage) {
        qrImage.innerHTML = '';
        qrImage.style.display = ''; 
    }

    if(status === 'paid'){
        // Animasi Sukses
        const successAnim = document.createElement('div');
        successAnim.id = 'successAnimation';
        successAnim.innerHTML = `<div style="text-align:center;padding:20px;margin-top:12px"><span style="font-size:48px;color:var(--success)">✅</span><p style="font-weight:700;color:var(--success)">Lunas!</p></div>`;
        
        // Update Firebase
        if(depoId && typeof DB !== 'undefined' && DB.ref) {
            DB.ref('orders').orderByChild('kode_deposit').equalTo(depoId).once('child_added', snap=>{
                snap.ref.update({ status: 'paid', paid_at: Date.now(), payment_method: 'QRIS' });
            });
        }
        
        if(actionsDiv && actionsDiv.parentNode) actionsDiv.parentNode.insertBefore(successAnim, actionsDiv.nextSibling);
        setTimeout(()=> document.getElementById('successAnimation')?.remove(), 5000);
        
        // Kosongkan Cart
        CART={}; document.querySelectorAll('[class^="qty-"]').forEach(el=>el.textContent='0'); updateCart();

    } else if (status === 'cancelled'){
        // Update Firebase Cancelled
        if(depoId && typeof DB !== 'undefined' && DB.ref) {
            DB.ref('orders').orderByChild('kode_deposit').equalTo(depoId).once('child_added', snap=>{
                if(snap.val().status === 'pending'){
                    snap.ref.update({ status: 'cancelled', cancelled_at: Date.now() });
                }
            });
        }
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

  // Firebase Save
  const orderTemplate = { txid, amount: total, items, status:'pending', method_choice: method, created_at: Date.now() };

  try {
    if(typeof DB !== 'undefined' && DB.ref) await DB.ref('orders/'+txid).set(orderTemplate);

    if(method === 'cash'){
      if(typeof DB !== 'undefined' && DB.ref) {
        await DB.ref('orders/'+txid).update({ via:'cash' });
      }
    }
    
    CART={}; document.querySelectorAll('[class^="qty-"]').forEach(el=>el.textContent='0'); updateCart();
    alert('Order dibuat. Kode: ' + txid);

    // Listen status
    if(typeof DB !== 'undefined' && DB.ref) {
      DB.ref('orders/'+txid+'/status').on('value', snap=>{
        const s = snap.val();
        if(s === 'paid'){
          alert('Pembayaran terkonfirmasi.');
          DB.ref('orders/'+txid+'/status').off('value'); 
        } else if(s === 'cancelled'){
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
function startClock(){
  const el = document.getElementById('clock');
  if(!el) return;
  setInterval(()=>{ const d=new Date(); el.textContent = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; },1000);
}
