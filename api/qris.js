// File: api/qris.js (Versi dengan Logging Tambahan)

const ARIEPULSA_API_URL = "https://ariepulsa.my.id/api/qrisrealtime";
const API_KEY = process.env.ARIEPULSA_KEY || "Q1yAmTLnVqfmcVbZW8gYiDeu15WKTNf4"; 

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: false, pesan: 'Method Not Allowed' });
    }

    try {
        const clientPayload = req.body;
        console.log('1. Payload diterima dari client:', clientPayload); // DEBUG

        if (!API_KEY) {
            console.error('API_KEY tidak ditemukan!');
            return res.status(500).json({ status: false, pesan: 'Server Error: API Key tidak dikonfigurasi.' });
        }
        
        const formData = new URLSearchParams();
        formData.append("api_key", API_KEY);
        for (const key in clientPayload) {
            // Pastikan data yang dikirim tidak undefined
            if (clientPayload[key] !== undefined) {
                formData.append(key, clientPayload[key]);
            }
        }
        console.log('2. Data yang dikirim ke Ariepulsa (formData):', formData.toString()); // DEBUG

        const response = await fetch(ARIEPULSA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: formData.toString()
        });
        
        console.log('3. Status response dari Ariepulsa:', response.status); // DEBUG

        // Jika response dari Ariepulsa bukan 200/OK
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error Response dari Ariepulsa:', errorText);
            // Ini akan menyebabkan client menerima "Proxy error: 502" atau sejenisnya
            return res.status(response.status).json({ status: false, pesan: `Ariepulsa API Error: ${response.status}`, details: errorText });
        }

        const data = await response.json();
        console.log('4. Response JSON akhir:', data); // DEBUG
        
        res.status(200).json(data);

    } catch (error) {
        console.error('KESALAHAN FATAL DALAM PROXY:', error.message, error.stack);
        // Pastikan format error yang dikirim ke klien jelas
        res.status(500).json({ status: false, pesan: `Server Error: ${error.message}`, error_details: error.message });
    }
};
