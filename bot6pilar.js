const TelegramBot = require('node-telegram-bot-api');
const mysql = require('mysql');

// Ganti dengan token bot Anda
const token = '6985276968:AAHLbtkeloLjxvTbpWh5RI74IyGtRH5346I';

// Buat koneksi ke database MySQL
const connection = mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'db_kpro',
});

// Inisialisasi bot
const bot = new TelegramBot(token, { polling: true });

// Variabel status untuk melacak apakah pengguna sedang dalam proses memilih /cek_in atau /cek_odp
let status = {};

// Fungsi untuk menghasilkan keyboard
function keyboardListMenuSpecial() {
    return {
        'resize_keyboard': true,
        'inline_keyboard': [
            [{ text: 'CEK IN', callback_data: '/cek_in' }],
            [{ text: 'CEK ODP', callback_data: '/cek_odp' }],
        ]
    };
}

// Menangani perintah /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: keyboardListMenuSpecial()
    };
    bot.sendMessage(chatId, 'Pilih menu :', opts);
});

// Menangani pemilihan menu
bot.on('callback_query', (callbackQuery) => {
    const messageText = callbackQuery.data;
    const chatId = callbackQuery.message.chat.id;

    switch (messageText) {
        case '/cek_in':
            // Memeriksa apakah pengguna sedang dalam proses memilih /cek_odp
            if (status[chatId] === '/cek_odp') {
                bot.sendMessage(chatId, 'Anda sedang dalam proses memilih ODP. Batalkan terlebih dahulu untuk memilih /cek_in.');
                return;
            }
            // Mengatur status pengguna menjadi /cek_in
            status[chatId] = '/cek_in';
            requestLocation(chatId, 'Kirimkan lokasi Anda untuk melakukan Check In.');
            break;
        case '/cek_odp':
            // Memeriksa apakah pengguna sedang dalam proses memilih /cek_in
            if (status[chatId] === '/cek_in') {
                bot.sendMessage(chatId, 'Anda sedang dalam proses memilih Check In. Batalkan terlebih dahulu untuk memilih /cek_odp.');
                return;
            }
            // Mengatur status pengguna menjadi /cek_odp
            status[chatId] = '/cek_odp';
            requestLocation(chatId, 'Silahkan pilih lokasi yang ingin Anda cek ODP terdekat.');
            break;
        default:
            bot.sendMessage(chatId, 'Pilihan tidak valid. Silakan pilih menu dari daftar yang tersedia.');
    }
});

// Fungsi untuk mengirim permintaan lokasi kepada pengguna
function requestLocation(chatId, message) {
    bot.sendMessage(chatId, message, {
        reply_markup: {
            keyboard: [[{ text: "Kirim Lokasi", request_location: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    });
}

// Menangani pesan lokasi yang diterima dari pengguna
bot.on('location', (msg) => {
    const chatId = msg.chat.id;
    const latitude = msg.location.latitude;
    const longitude = msg.location.longitude;

    if (status[chatId] === '/cek_in') {
        handleLocationForCheckIn(chatId, latitude, longitude);
        // Mengatur status pengguna menjadi null setelah pemrosesan selesai
        status[chatId] = null;
    } else if (status[chatId] === '/cek_odp') {
        handleLocationForCheckODP(chatId, latitude, longitude);
        // Mengatur status pengguna menjadi null setelah pemrosesan selesai
        status[chatId] = null;
    }
});

// Fungsi untuk menangani lokasi yang dikirimkan untuk 'CEK IN'
function handleLocationForCheckIn(chatId, latitude, longitude) {
    // Di sini Anda dapat menambahkan logika khusus untuk penanganan lokasi pada menu 'CEK IN'
    bot.sendMessage(chatId, `Lokasi Anda untuk Check In : ${latitude},${longitude}`);
}

// Fungsi untuk menangani lokasi yang dikirimkan untuk 'CEK ODP'
function handleLocationForCheckODP(chatId, latitude, longitude) {
    // Query untuk mendapatkan semua lokasi ODP dari database
    const query = 'SELECT NAME_ALPRO, TITIK_KORDINAT FROM tb_odp';

    // Eksekusi query
    connection.query(query, (error, results, fields) => {
        if (error) {
            console.error('Error querying database: ' + error.stack);
            return;
        }

        // Variabel untuk menyimpan 5 ODP terdekat
        let nearestODPs = [];

        // Iterasi semua hasil query dan hitung jarak ke lokasi pengguna
        results.forEach(odp => {
            const odpLatitude = parseFloat(odp.TITIK_KORDINAT.split(',')[0]);
            const odpLongitude = parseFloat(odp.TITIK_KORDINAT.split(',')[1]);
            const distance = calculateDistance(latitude, longitude, odpLatitude, odpLongitude);
            
            // Masukkan ODP ke dalam array nearestODPs
            nearestODPs.push({ name: odp.NAME_ALPRO, distance: distance });
        });

        // Urutkan nearestODPs berdasarkan jarak (dari yang terdekat ke yang terjauh)
        nearestODPs.sort((a, b) => a.distance - b.distance);

        // Ambil 5 ODP terdekat
        const closestODPs = nearestODPs.slice(0, 5);

        // Kirim informasi tentang 5 ODP terdekat kepada pengguna
        if (closestODPs.length > 0) {
            let message = 'Berikut adalah 5 ODP terdekat :\n\n';
            closestODPs.forEach((odp, index) => {
                message += `${index + 1}. ${odp.name} - Jarak : ${odp.distance.toFixed(2)} meter\n`;
            });
            bot.sendMessage(chatId, message);
        } else {
            bot.sendMessage(chatId, 'Tidak ada ODP yang ditemukan.');
        }
    });
}

// Fungsi untuk menghitung jarak antara dua titik koordinat menggunakan rumus Haversine
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Radius bumi dalam meter
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    const distance = R * c;
    return distance;
}

// Memulai bot
console.log('Bot Activated');
