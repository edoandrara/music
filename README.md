# MusicPlayer 2026

Upgrade project MusicPlayer berbasis HTML, CSS, JavaScript dan backend Node.js tanpa dependency pihak ketiga.

## Fitur
- Pencarian YouTube melalui `https://api.siputzx.my.id/api/s/youtube?query=...`
- Hasil pencarian dinormalisasi dan hanya video valid yang ditampilkan (playlist diabaikan).
- Player HTML5: play/pause, previous/next, shuffle, repeat, seek, mini player.
- Riwayat pemutaran disimpan di localStorage.
- Pilihan download MP3 (128/192/256/320 kbps) dan MP4 (360/480/720/1080p).
- Backend streaming/download agar browser tidak perlu mengirim header converter.
- Timeout, validasi video ID, validasi format/kualitas, host allowlist, dan error handling.
- Rendering judul/metadata memakai `textContent`, bukan HTML dinamis.

## Persyaratan
- Node.js 20 atau lebih baru.
- Koneksi internet.
- Endpoint pihak ketiga (SiputzX dan YTMp3PC/ytzyar) harus tersedia dan mengizinkan akses dari server Anda.

## Menjalankan
```bash
npm start
```
Buka `http://localhost:3000`.

Tidak perlu `npm install` karena backend memakai modul bawaan Node.js.

## API lokal
- `GET /api/health`
- `GET /api/search?query=duka`
- `GET /api/media?videoId=8zwz2fVgfVM&format=mp3&quality=320` (stream)
- `GET /api/media?videoId=8zwz2fVgfVM&format=mp4&quality=720&download=1` (download)

## Konfigurasi
- `PORT` (default 3000)
- `HOST` (default 0.0.0.0)

Contoh:
```bash
PORT=8080 npm start
```

## Catatan penting
1. File scraper YTMp3PC yang diberikan diadaptasi menjadi backend Node.js, bukan dijalankan di browser. Token dan header converter tidak diekspos ke frontend.
2. Penyedia converter pihak ketiga dapat mengubah endpoint, format respons, domain file, atau kebijakan akses sewaktu-waktu. Jika host hasil download berubah, perbarui `ALLOWED_MEDIA_HOSTS` setelah memverifikasi domain resminya.
3. Browser tidak dapat menjamin autoplay. Pemutaran dimulai setelah pengguna menekan lagu.
4. Konversi dapat gagal untuk video private, dibatasi wilayah/usia, live, atau tidak didukung oleh converter.
5. Gunakan hanya konten yang Anda miliki atau yang penggunaannya/unduhannya diizinkan. YouTube dan pemegang hak cipta tetap memiliki ketentuan masing-masing.
6. Project ini tidak memiliki database server. Riwayat masih tersimpan lokal per browser. Sinkronisasi akun/perangkat memerlukan database dan autentikasi tambahan.

## Struktur
```text
music-player-main/
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   └── script.js
├── index.html
├── server.js
├── package.json
└── README.md
```
