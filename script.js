// script.js (user page) — NOW USING ARIEPULSA QRIS REALTIME API

// Products (fixed)
const PRODUCTS = [
    { id:'yklt_ori', name:'Yakult Original', pack:10000, pallet:100000, img:'img/yklt-ori.png' },
    { id:'yklt_mango', name:'Yakult Mangga', pack:10500, pallet:105000, img:'img/yklt-mangga.png' },
    { id:'yklt_light', name:'Yakult Light', pack:12500, pallet:125000, img:'img/yklt-light.png' },
    { id:'open_Donasi', name:'Open Donasi', pack:1000, pallet:1000, img:'img/open-Donasu.png' },
    { id:'tess_aja', name:'tes', pack:100, pallet:100, img:'img/open-tes.png' }

];

// NOTE: QRIS_STATIS is no longer strictly used for QR generation, but kept for legacy structure.
// We will use the QR link from Ariepulsa API response.
const QRIS_STATIS = "00020101021126570011ID.DANA.WWW011893600915380003780002098000378000303UMI51440014ID.CO.QRIS.WWW0215ID10243620012490303UMI5204549953033605802ID5910Warr2 Shop6015Kab. Bandung Ba6105402936304BF4C";

let CART = {};
let lastTx = null;

// --- ARIEPULSA API CONFIGURATION & STATE ---
// Harap ganti API_KEY dengan kunci yang sebenarnya.
const API_URL = "https://ariepulsa.my.id/api/qrisrealtime";
const API_KEY = "Q1yAmTLnVqfmcVbZW8gYiDeu15WKTNf4"; // Placeholder key
let kodeDeposit = null;
let autoCheckInterval = null;
let apiCountdownInterval = null; // Ganti nama agar tidak konflik dengan countdown lokal
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

/**
 * MODIFIED: Menggunakan updateTotals() untuk konsistensi tampilan.
 */
function updateCart(){
    const list = document.getElementById('cartList'); if(!list) return;
    list.innerHTML='';
    const keys = Object.keys(CART).filter(k=>CART[k]>0);
    
    const subTotal = calculateTotal(CART); // Dapatkan subtotal
    
    if(keys.length===0){ 
        list.innerHTML = '<div class="muted">Troli kosong</div>'; 
        updateTotals(0); // Update tampilan total menjadi nol
        return; 
    }
    
    keys.forEach(k=>{
        const p = PRODUCTS.find(x=>x.id===k);
        const qty = CART[k];
        const sub = qty * p.pack;
        const item = document.createElement('div'); item.className='cart-item';
        item.innerHTML = `<div><strong>${p.name}</strong><div class="small">${qty} x ${formatRp(p.pack)}</div></div>
                          <div style="display:flex;align-items:center;gap:8px"><div style="font-weight:900">${formatRp(sub)}</div><button class="btn ghost" data-rm="${k}">✕</button></div>`;
        list.appendChild(item);
    });
    
    // Update Total (sekarang memanggil fungsi baru)
    updateTotals(subTotal);

    list.querySelectorAll('[data-rm]').forEach(b=> b.addEventListener('click', e=>{
        const id = e.currentTarget.dataset.rm; delete CART[id]; const qel = document.querySelector('.qty-'+id); if(qel) qel.textContent = 0; updateCart();
    }));
    return subTotal; // Return subtotal
}

/**
 * NEW FUNCTION: Menghitung dan menampilkan Subtotal, Fee, dan Total Akhir
 * Catatan: Karena fee QRIS hanya diketahui setelah call API, di sini kita hanya menampilkan Subtotal. 
 * Fee dan Total Akhir akan di-update oleh updateTotalsWithApiData() setelah API dipanggil.
 */
function updateTotals(subTotal){
    const subtotalEl = document.getElementById('subtotalAmount');
    const serviceFeeEl = document.getElementById('serviceFee');
    const totalWithFeeEl = document.getElementById('totalWithFee');
    
    if(subtotalEl) subtotalEl.textContent = formatRp(subTotal);
    
    // Reset Fee dan Total Akhir saat troli berubah, karena fee bisa berubah tergantung subtotal
    if(serviceFeeEl) serviceFeeEl.textContent = formatRp(0);
    if(totalWithFeeEl) totalWithFeeEl.textContent = formatRp(subTotal); // Tampilkan Subtotal di Total Akhir sebelum fee dihitung
}

/**
 * NEW FUNCTION: Mengupdate tampilan total dengan data Fee dari API
 */
function updateTotalsWithApiData(fee, totalBayar){
    const serviceFeeEl = document.getElementById('serviceFee');
    const totalWithFeeEl = document.getElementById('totalWithFee');
    
    if(serviceFeeEl) serviceFeeEl.textContent = formatRp(fee);
    if(totalWithFeeEl) totalWithFeeEl.textContent = formatRp(totalBayar);
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

/* Payment buttons: QR or Cash (user selects method only) */
const payQrBtn = document.getElementById('payQrBtn');
const payCashBtn = document.getElementById('payCashBtn');
// MODIFIED: QR button now starts the confirmation workflow
if(payQrBtn) payQrBtn.addEventListener('click', ()=> startQrisWorkflow());
if(payCashBtn) payCashBtn.addEventListener('click', ()=> startOrder('cash'));

/* hide QR button */
const hideQRBtn = document.getElementById('hideQR');
if(hideQRBtn) hideQRBtn.addEventListener('click', ()=> endQrisFlow('hide'));


/* ---------------- NEW: QRIS Workflow with Fee & Countdown (Ariepulsa) ---------------- */

function startQrisWorkflow(){
    const subTotal = calculateTotal(CART);
    if(Object.keys(CART).filter(k=>CART[k]>0).length===0){ alert('Troli kosong'); return; }
    
    // Tampilkan loading & kirim permintaan ke Ariepulsa untuk mendapatkan fee resmi
    const qrBox = document.getElementById('qrBox');
    const qrImage = document.getElementById('qrImage');
    const qrInfo = document.getElementById('qrInfo');
    const downloadBtn = document.getElementById('downloadQR');
    
    if(qrBox) qrBox.classList.remove('hidden');
    if(qrImage) qrImage.innerHTML = `<div style="text-align:center;padding:20px"><p>Memuat biaya layanan & QRIS...</p></div>`;
    if(qrInfo) qrInfo.textContent = 'Menunggu respons API...';
    if(downloadBtn) downloadBtn.style.display='none';
    
    // Sembunyikan tombol actions saat loading
    const actionsDiv = document.querySelector('.actions');
    if(actionsDiv) actionsDiv.style.display='none';
    
    // Cek jika sudah ada deposit yang aktif
    if(kodeDeposit){
        alert('Transaksi QRIS sebelumnya masih aktif. Harap batalkan atau tunggu hingga selesai.');
        if(qrBox) qrBox.classList.add('hidden');
        if(actionsDiv) actionsDiv.style.display='flex';
        return;
    }
    
    // Panggil API untuk mendapatkan deposit
    callAriepulsaDeposit(subTotal);
}

// 1. Panggil API Ariepulsa (get-deposit)
async function callAriepulsaDeposit(subTotal){
    const txid = createTxId();
    lastTx = txid;
    
    const qrBox = document.getElementById('qrBox'); 
    const qrImage = document.getElementById('qrImage'); 
    const qrInfo = document.getElementById('qrInfo');

    const form = new FormData();
    form.append("api_key", API_KEY);
    form.append("action", "get-deposit");
    form.append("jumlah", subTotal);
    form.append("reff_id", txid);
    form.append("kode_channel", "QRISREALTIME");
    
    try {
        const req = await fetch(API_URL,{ method:"POST", body:form });
        const res = await req.json(); //
        
        if(res.status && res.data){ //
            const data = res.data;
            kodeDeposit = data.kode_deposit; // Simpan kode deposit
            
            // UPDATE: Panggil fungsi untuk mengupdate tampilan Total dengan data API
            updateTotalsWithApiData(data.fee, data.jumlah_transfer);

            // Tampilkan detail total, fee, dan konfirmasi (Persyaratan: total pembelian & fee)
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
            
            // Bind event listener untuk konfirmasi
            document.getElementById('confirmQrisBtn').onclick = () => {
                // Lanjutkan ke tampilan QRIS dan mulai timer
                displayQrisAndStartFlow(data, subTotal, txid);
            };
            
            // Bind event listener untuk batal
            document.getElementById('cancelQrisBtn').onclick = () => {
                cancelDeposit(false, true); // Batal lokal sebelum timer dimulai
                // UPDATE: Reset tampilan total ke subtotal saat dibatalkan
                updateTotals(subTotal); 
            };

        } else { // Pemesanan gagal dari API
            alert('Gagal membuat deposit QRIS: ' + (res.data.pesan || 'Unknown error')); //
            endQrisFlow('error');
        }
        
    } catch(err){
        console.error(err);
        alert('Error koneksi API: ' + (err.message || err));
        endQrisFlow('error');
    }
}

// 2. Tampilkan QRIS dan mulai timer/auto-cek
async function displayQrisAndStartFlow(data, subTotal, txid){
    const qrBox = document.getElementById('qrBox'); 
    const qrImage = document.getElementById('qrImage'); 
    const qrInfo = document.getElementById('qrInfo');
    const countdownDisplay = document.getElementById('countdownTimer'); // Gunakan elemen baru

    // 2a. Sembunyikan tombol actions saat QRIS tampil
    const actionsDiv = document.querySelector('.actions');
    if(actionsDiv) actionsDiv.style.display='none';
    
    // 2b. Tampilkan QRIS yang didapat dari API
    if(qrImage) qrImage.innerHTML = `<img src="${data.link_qr}" alt="QRIS">`;
    if(qrInfo) qrInfo.textContent = `Kode Deposit: ${data.kode_deposit} | Total Bayar: ${formatRp(data.jumlah_transfer)}`;
    
    // 2c. Update Firebase (untuk admin panel)
    const items = getCartItems();
    const orderTemplate = { 
        txid, 
        amount: data.jumlah_transfer, // Total yang harus dibayar
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
        console.error('Gagal menyimpan ke Firebase', e);
    }

    // 2d. Mulai auto cek status & countdown
    startCountdown(COUNTDOWN_DURATION, data.kode_deposit); // 3 menit
    mulaiAutoCek(data.kode_deposit); // Cek status Ariepulsa
    
    // Atur ulang event download QR (hanya URL Ariepulsa yang tersedia)
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

// Helper untuk mengambil item cart
function getCartItems(){
    const keys = Object.keys(CART).filter(k=>CART[k]>0);
    const items=[];
    keys.forEach(k=>{
        const p = PRODUCTS.find(x=>x.id===k);
        items.push({ id:p.id, name:p.name, qty:CART[k], packPrice:p.pack });
    });
    return items;
}

/* ---------------- COUNTDOWN IMPLEMENTATION (MODIFIED) ---------------- */

// Hapus fungsi replacePayButtonWithCountdown karena timer sekarang ada di bawah QRIS

function startCountdown(duration, depositId){
    let remaining = duration;
    const display = document.getElementById('countdownTimer'); // Gunakan elemen baru di bawah QRIS
    
    if (apiCountdownInterval) clearInterval(apiCountdownInterval); // Pastikan countdown lama dihentikan

    // Set tampilan awal
    if (display) display.innerHTML = `**Sisa Waktu Pembayaran: ${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}**`;

    apiCountdownInterval = setInterval(() => {
        const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
        const seconds = String(remaining % 60).padStart(2, '0');
        
        if (display) display.innerHTML = `**Sisa Waktu Pembayaran: ${minutes}:${seconds}**`;

        if (--remaining < 0) {
            clearInterval(apiCountdownInterval);
            if (display) display.innerHTML = `**Waktu Pembayaran Habis!**`;
            // Waktu Habis: batalkan deposit via API
            cancelDeposit(true); // isAuto = true
        }
    }, 1000);
}


/* ---------------- AUTO CEK & CANCEL (Ariepulsa API) ---------------- */

// Cek Status Deposit (Ariepulsa API)
async function cekStatus(depoId = kodeDeposit){
    if(!depoId){ stopAutoCek(); return; }
    
    const form = new FormData();
    form.append("api_key", API_KEY);
    form.append("action", "status-deposit"); //
    form.append("kode_deposit", depoId);
    
    const req = await fetch(API_URL,{ method:"POST", body:form });
    const res = await req.json(); //

    const statusBox = document.getElementById("qrInfo"); // Re-use qrInfo for status
    
    if(res.status && res.data){ //
        const status = res.data.status;
        if(statusBox) statusBox.textContent = `Status: ${status} | Kode: ${depoId}`;
        
        // Cek status dan ambil tindakan
        if(status === "Success"){ //
            endQrisFlow('paid', depoId); // Sukses, tampilkan centang hijau
        } else if(status === "Error"){ //
            endQrisFlow('cancelled', depoId); // Error/Gagal
        }
        // Jika Pending, biarkan auto-cek jalan
    } else {
         if(statusBox) statusBox.textContent = `Status Cek Gagal: ${res.data.pesan || 'Error API'}`;
    }
}

// Mulai Cek Status Otomatis
function mulaiAutoCek(depoId){
    stopAutoCek();
    // Cek setiap 5 detik (3000ms terlalu cepat untuk API)
    autoCheckInterval = setInterval(() => cekStatus(depoId), 5000); 
}

// Hentikan Cek Status Otomatis
function stopAutoCek(){
    if(autoCheckInterval) clearInterval(autoCheckInterval);
}

// Batalkan Deposit (Ariepulsa API)
// isAuto = true -> waktu habis, isLocalOnly = true -> batal sebelum konfirmasi QR muncul
async function cancelDeposit(isAuto = false, isLocalOnly = false){
    // Dapatkan subtotal saat ini sebelum menghapus CART, untuk reset tampilan total.
    const currentSubtotal = calculateTotal(CART);

    // Jika hanya batal di tahap konfirmasi
    if(isLocalOnly){
        kodeDeposit = null;
        updateTotals(currentSubtotal); // Pastikan total kembali ke subtotal asli
        return endQrisFlow('cancelled'); // Cukup bersihkan tampilan
    }
    
    if(!kodeDeposit) return endQrisFlow('cancelled');

    const form = new FormData();
    form.append("api_key", API_KEY);
    form.append("action", "cancel-deposit"); //
    form.append("kode_deposit", kodeDeposit);

    try {
        const req = await fetch(API_URL,{ method:"POST", body:form });
        const res = await req.json(); //
        
        if(res.status){ //
            if(isAuto) alert('Waktu pembayaran QRIS habis. Transaksi dibatalkan.');
            else alert('Transaksi QRIS dibatalkan.');
            
            endQrisFlow('cancelled', kodeDeposit);
        } else {
             alert('Gagal membatalkan transaksi: ' + (res.data.pesan || 'Unknown error'));
             // Walaupun gagal batal di API, kita tetap bersihkan di sisi klien
             endQrisFlow('cancelled'); 
        }
        // Pastikan total kembali ke subtotal asli
        updateTotals(currentSubtotal);
    } catch(e){
        console.error(e);
        alert('Error koneksi API saat membatalkan.');
        endQrisFlow('cancelled');
        // Pastikan total kembali ke subtotal asli
        updateTotals(currentSubtotal); 
    }
}

// Mengelola tampilan akhir (Sukses, Batal, Expired)
function endQrisFlow(status = 'default', depoId = null){
    // 1. Bersihkan
    if (apiCountdownInterval) clearInterval(apiCountdownInterval); // Perbaiki: gunakan apiCountdownInterval
    stopAutoCek();
    kodeDeposit = null; // Reset state
    lastTx = null;
    
    // 2. Elemen UI
    const qrBox = document.getElementById('qrBox'); 
    const qrImage = document.getElementById('qrImage'); 
    const qrInfo = document.getElementById('qrInfo');
    const countdownDisplay = document.getElementById('countdownTimer'); // Elemen Timer
    const actionsDiv = document.querySelector('.actions');
    const payQrBtn = document.getElementById('payQrBtn');
    
    // 3. Sembunyikan/Hapus tampilan QRIS dan reset timer text
    if(qrBox) qrBox.classList.add('hidden');
    if(countdownDisplay) countdownDisplay.textContent = ''; // Kosongkan tampilan timer
    
    // 4. Tampilkan kembali tombol aksi
    if(payQrBtn) payQrBtn.style.display = 'inline-block';
    if(document.getElementById('payCashBtn')) document.getElementById('payCashBtn').style.display = 'inline-block';
    if(actionsDiv) actionsDiv.style.display='flex';
    
    // 5. Tampilkan animasi atau pesan
    if(status === 'paid'){
        // Sukses: Tampilkan centang hijau
        const successAnim = document.createElement('div');
        successAnim.id = 'successAnimation';
        successAnim.innerHTML = `
            <div style="text-align:center;padding:20px;margin-top:12px">
                <span style="font-size:48px;color:var(--success)">✅</span>
                <p style="font-weight:700;color:var(--success)">Pembayaran Terkonfirmasi!</p>
            </div>
        `;
        // Update Firebase status agar riwayat terupdate
        if(depoId && typeof DB !== 'undefined' && DB.ref) {
            DB.ref('orders').orderByChild('kode_deposit').equalTo(depoId).once('child_added', snap=>{
                snap.ref.update({ status: 'paid', paid_at: Date.now(), payment_method: 'QRIS' });
            });
            // Hentikan listener Firebase yang mungkin masih berjalan dari flow lama
            DB.ref('orders/'+lastTx+'/status').off('value'); 
        }
        
        // Sisipkan animasi setelah tombol aksi
        if(actionsDiv && actionsDiv.parentNode) actionsDiv.parentNode.insertBefore(successAnim, actionsDiv.nextSibling);
        
        // Hapus animasi setelah 5 detik
        setTimeout(()=> document.getElementById('successAnimation')?.remove(), 5000);
        
        // Clear cart
        CART={}; document.querySelectorAll('[class^="qty-"]').forEach(el=>el.textContent='0'); updateCart();

    } else if (status === 'cancelled'){
        // Batal
        if(depoId && typeof DB !== 'undefined' && DB.ref) {
            DB.ref('orders').orderByChild('kode_deposit').equalTo(depoId).once('child_added', snap=>{
                // Jika status di firebase masih pending, ubah menjadi cancelled/expired
                if(snap.val().status === 'pending'){
                    snap.ref.update({ status: 'cancelled', cancelled_at: Date.now() });
                }
            });
        }
    }
    
    // Jika status "hide" (tombol sembunyikan diklik), jangan tampilkan alert
    if(status !== 'hide') {
        if(qrImage) qrImage.innerHTML = ''; // Bersihkan konten QR
        if(qrInfo) qrInfo.textContent = ''; // Bersihkan info
    }
    
    // Pastikan total kembali ke subtotal asli jika tidak paid
    if(status !== 'paid'){
        updateTotals(calculateTotal(CART));
    }
}


/* ---------------- startOrder: CASH flow (kept for Firebase update) ---------------- */
// Only handles 'cash' now. QRIS is handled by startQrisWorkflow
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

    // Save initial order (status pending) — include method chosen by user
    const orderTemplate = { txid, amount: total, items, status:'pending', method_choice: method, created_at: Date.now() };

    try {
        // save minimal order first so admin sees pending
        if(typeof DB !== 'undefined' && DB.ref) await DB.ref('orders/'+txid).set(orderTemplate);

        if(method === 'cash'){
            // Cash flow
            if(document.getElementById('qrImage')) document.getElementById('qrImage').innerHTML = `<div class="small muted">Transaksi cash dicatat. Bayar tunai ke admin.</div>`;
            if(typeof DB !== 'undefined' && DB.ref) {
                await DB.ref('orders/'+txid).update({ via:'cash' });
            }
            if(document.getElementById('qrInfo')) document.getElementById('qrInfo').textContent = `Kode: ${txid} (CASH)`;
        }
        
        // clear cart visually
        CART={}; document.querySelectorAll('[class^="qty-"]').forEach(el=>el.textContent='0'); updateCart();
        alert('Order dibuat. Kode: ' + txid + '. Tunggu proses di admin.');

        // Listen for status changes for this tx (the user will be notified when admin updates)
        // This is kept for cash transactions which still rely on admin updating status in Firebase.
        if(typeof DB !== 'undefined' && DB.ref) {
            DB.ref('orders/'+txid+'/status').on('value', snap=>{
                const s = snap.val();
                if(s === 'paid'){
                    if(qrBox) qrBox.classList.add('hidden');
                    alert('Pembayaran terkonfirmasi. Terima kasih!');
                    DB.ref('orders/'+txid+'/status').off('value'); // Stop listener after success
                } else if(s === 'cancelled'){
                    if(qrBox) qrBox.classList.add('hidden');
                    alert('Transaksi dibatalkan oleh admin.');
                    DB.ref('orders/'+txid+'/status').off('value'); // Stop listener after cancel
                } else {
                    // still pending
                }
            });
        }

    } catch(err){
        console.error(err);
        if(document.getElementById('qrImage')) document.getElementById('qrImage').innerHTML = `<div class="small muted">Gagal membuat transaksi</div>`;
        if(document.getElementById('qrInfo')) document.getElementById('qrInfo').textContent = '';
        alert('Gagal membuat transaksi: ' + (err.message || err));
    }
}

/* ---------------- utilities & EMV helpers (kept for Firebase update) ---------------- */
function buildEmvWithAmount(qrisStatis, amountStr){
    // Adds tag 54 (amount) and recalculates CRC (6304)
    const upper = qrisStatis.toUpperCase();
    const crcIndex = upper.indexOf('6304');
    if(crcIndex === -1) throw new Error('QRIS statis tidak memiliki tag CRC (6304)');
    const value54 = String(amountStr);
    const len54 = String(value54.length).padStart(2,'0');
    const tag54 = '54' + len54 + value54;
    const beforeCrc = qrisStatis.substring(0, crcIndex);
    const emvNoCrc = beforeCrc + tag54 + '6304';
    const crc = crc16ccitt(emvNoCrc).toUpperCase();
    const emvFull = emvNoCrc + crc;
    return emvFull;
}

function crc16ccitt(inputStr){
    const poly = 0x1021;
    let crc = 0xFFFF;
    for(let i=0;i<inputStr.length;i++){
        let byte = inputStr.charCodeAt(i) & 0xFF;
        crc ^= (byte << 8);
        for(let j=0;j<8;j++){
            if((crc & 0x8000) !== 0) crc = ((crc << 1) ^ poly) & 0xFFFF;
            else crc = (crc << 1) & 0xFFFF;
        }
    }
    return crc.toString(16).padStart(4,'0');
}

function makeGoogleChartQrUrl(dataStr, size=300){
    const encoded = encodeURIComponent(dataStr);
    return `https://chart.googleapis.com/chart?cht=qr&chs=${size}x${size}&chl=${encoded}&chld=L|1`;
}

/* ---------------- utilities general ---------------- */
function createTxId(){
    const d = new Date();
    // Using custom prefix to distinguish from Ariepulsa kode_deposit if needed, though reff_id is used for mapping
    return 'YKLT' + d.getFullYear() + pad2(d.getMonth()+1) + pad2(d.getDate()) + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
}
function formatRp(n){ return 'Rp' + Number(n||0).toLocaleString('id-ID'); }
function pad2(n){ return String(n).padStart(2,'0'); }

/* ---------------- history for user (unchanged) ---------------- */
/* Show last paid orders (clean receipt-style) in #historyList */
function renderUserHistoryFromOrders(snapshotVal){
    const historyEl = document.getElementById('historyList');
    if(!historyEl) return;
    historyEl.innerHTML = '';
    if(!snapshotVal){
        historyEl.innerHTML = '<div class="muted">Belum ada riwayat</div>';
        return;
    }
    // snapshotVal is object of orders maybe; filter paid
    const arr = Object.values(snapshotVal).filter(o=>o.status === 'paid').sort((a,b)=> (b.paid_at || 0) - (a.paid_at || 0) || (b.created_at || 0) - (a.created_at || 0));
    if(arr.length === 0){
        historyEl.innerHTML = '<div class="muted">Belum ada riwayat</div>';
        return;
    }
    // show up to 8 recent
    arr.slice(0,8).forEach(o=>{
        const node = document.createElement('div'); node.className = 'card';
        const time = o.paid_at ? new Date(o.paid_at).toLocaleString() : (o.created_at? new Date(o.created_at).toLocaleString() : '-');
        const itemsHtml = (o.items||[]).map(i=> `<div style="display:flex;justify-content:space-between"><div>${i.name} x${i.qty}</div><div>${formatRp((i.qty||0) * (i.packPrice||0))}</div></div>`).join('');
        node.style.padding='10px';
        node.style.marginBottom='8px';
        node.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div><strong>${o.txid || o.txid}</strong><div class="small">${time}</div></div>
                <div style="text-align:right"><div style="font-weight:900">${formatRp(o.amount)}</div><div class="small">${(o.payment_method || o.method_choice || '').toUpperCase()}</div></div>
            </div>
            <div style="margin-top:8px">${itemsHtml}</div>
        `;
        historyEl.appendChild(node);
    });
}

/* listen orders to update history (realtime) */
if(typeof DB !== 'undefined' && DB.ref){
    DB.ref('orders').on('value', snap=>{
        const val = snap.val() || {};
        renderUserHistoryFromOrders(val);
    });
}

/* ---------------- init (unchanged) ---------------- */
renderProducts();
updateCart();
startClock();
function startClock(){
    const el = document.getElementById('clock');
    if(!el) return;
    setInterval(()=>{ const d=new Date(); el.textContent = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; },1000);
}