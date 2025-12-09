// File: api/qris.js (Vercel Serverless Function - Proxy)

const ARIEPULSA_API_URL = "https://ariepulsa.my.id/api/qrisrealtime";

// HARAP GANTI DENGAN API KEY ASLI ATAU GUNAKAN ENVIRONMENT VARIABLE DI VERCEL
const API_KEY = process.env.ARIEPULSA_KEY || "Q1yAmTLnVqfmcVbZW8gYiDeu15WKTNf4"; 

// Fungsi handler untuk semua permintaan ke /api/qris
module.exports = async (req, res) => {
    // Hanya izinkan method POST dari client
    if (req.method !== 'POST') {
        return res.status(405).json({ status: false, pesan: 'Method Not Allowed' });
    }

    try {
        // Data dikirim dari client (script.js) sebagai JSON (req.body)
        const clientPayload = req.body;
        
        // Buat FormData/URLSearchParams untuk dikirim ke API Ariepulsa (format yang mereka butuhkan)
        const formData = new URLSearchParams();
        formData.append("api_key", API_KEY);
        // Salin semua data dari JSON client ke format form data
        for (const key in clientPayload) {
            formData.append(key, clientPayload[key]);
        }

        // Panggil API Ariepulsa dari sisi server (Bebas CORS/Mixed Content)
        const response = await fetch(ARIEPULSA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });

        const data = await response.json();
        
        // Teruskan respons dari Ariepulsa kembali ke browser client
        res.status(200).json(data);

    } catch (error) {
        console.error('Error in proxy fetch:', error);
        res.status(500).json({ status: false, pesan: 'Error koneksi API (Proxy failed)', error: error.message });
    }
};