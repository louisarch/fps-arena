# Pulse Arena

FPS browser pemain tunggal dengan arena 3D prosedural, senjata pulsa, dan 12 robot dalam tiga gelombang. Bukan mod atau salinan game lain. Proyek terpisah dari Growlander.

**[Mainkan di browser](https://louisarch.github.io/fps-arena/)** · **[Kode sumber](https://github.com/louisarch/fps-arena)**

## Cara bermain

Klik **Mulai operasi**. Bertahan hidup dan habisi gelombang berisi 3, 4, lalu 5 robot. Setiap robot memerlukan tiga tembakan. Cahaya merah menandai serangan setidaknya 0,7 detik sebelum proyektil diluncurkan: bergerak menyamping atau berlindung di balik dinding.

| Aksi | Desktop | Layar sentuh / tanpa Pointer Lock |
|---|---|---|
| Bergerak | WASD | Joystick kiri |
| Melihat / membidik | Mouse terkunci | Geser area kanan |
| Tembak | Klik kiri, satu peluru per klik | Tombol Tembak, satu peluru per tap |
| Muat ulang | R / tombol UI | Tombol isi ulang |
| Sprint | Tahan Shift | Tahan Sprint |
| Jeda / lanjut | Esc / tombol Jeda | Tombol Jeda / Lanjutkan |

Esc melepas mouse dan menjeda. Memindahkan tab/fokus juga menjeda. Melanjutkan meminta Pointer Lock kembali. Audio sintetis opsional dapat dimatikan melalui tombol suara. Tidak ada lompat, multiplayer, akun, iklan, atau transaksi.

Mulai dengan 100 HP dan 12/48 amunisi. Hit memberi 34 damage; robot tumbang memberi 100 skor; setiap proyektil musuh memberi 10 damage sekali. Tembakan efektif sampai 30 meter dan terhalang dinding. Akurasi adalah hit dibagi tembakan. Reload berlangsung 1,2 detik waktu simulasi; jeda antargelombang 1,5 detik dan hanya magasin yang diisi kembali, bukan HP. Maksimum skor 1.200.

## Jalankan secara lokal

Gunakan Node.js 24 dan npm. Jangan membuka `index.html` melalui `file://`; browser memerlukan server untuk ES modules.

```sh
npm ci
npm run dev
```

Buka URL lokal yang ditampilkan Vite. Untuk build produksi:

```sh
npm run build
npm run preview
```

Build memakai jalur relatif sehingga dapat ditempatkan di subdirektori GitHub Pages. Three.js dibundel secara lokal; halaman game tidak memuat font, gambar, atau skrip CDN saat dimainkan. Unduhan awal tetap memerlukan koneksi; tidak tersedia service worker/offline cache khusus.

## Pengujian yang dapat diulang

```sh
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run build
npm audit
```

`tests/game.test.js` menggunakan Node test runner, clock terkontrol, dan spawn deterministik. Cakupan: damage, wall/range block, ammo/cooldown, reload, sprint/collision, pitch, telegraph, proyektil sekali-hit, pause/intermission, 3 gelombang, hasil dan reset.

`tests/browser.spec.js` menggunakan Chromium/SwiftShader: input keyboard/klik dan Pointer Lock nyata (delta mouse disuntikkan terkontrol pada headless), bidikan deterministik dan hit raycast, dinding, reload, jeda, retry, kontrol sentuh dan layout 1280×720, 1024×768, 390×844, 844×390, serta fallback WebGL/Pointer Lock. Integrasi kemenangan memakai clock dan posisi bidik yang dikontrol melalui harness; itu **bukan** klaim seseorang menyelesaikan seluruh sesi dengan tangan.

Harness hanya diekspos saat URL memakai `?test=1`: `window.__arena` menyediakan simulasi, renderer, dan snapshot untuk QA. Sesi normal tidak mengeksposnya. Untuk menguji build hosted dengan suite yang sama:

```sh
TEST_BASE_URL=https://louisarch.github.io/fps-arena/ npm run test:browser
```

Hasil JSON lokal disimpan di `test-results/browser.json` dan tidak masuk Git. Tidak ada klaim bebas bug atau kompatibilitas semua perangkat.

## Struktur

- `src/game.js`: aturan dan clock deterministik tanpa DOM/Three.js.
- `src/renderer.js`: geometri/material orisinal, kamera orang pertama, robot, indikator HP, raycast dan efek.
- `src/main.js`: input, HUD, transisi dialog, audio dan fallback.
- `src/style.css` dan `index.html`: UI responsif Bahasa Indonesia, fokus, kontras dan kontrol sentuh.
- `tests/`: pengujian aturan dan smoke browser.
- `.github/workflows/pages.yml`: tes, build dan publikasi Pages.

## Publikasi

Push ke cabang `main` menjalankan workflow **Test and publish Pulse Arena**. Di Settings → Pages, pilih **GitHub Actions** sebagai sumber publikasi. Workflow memerlukan izin `pages: write` dan `id-token: write`; hanya folder `dist` yang dipublikasikan. Gagal tes menghentikan deploy. Tidak diperlukan rahasia aplikasi.

## Batasan yang diketahui

WebGL2 dan browser modern diperlukan; jika tidak ada, menu menampilkan pesan dan tombol mulai dinonaktifkan. Pointer Lock dapat dibatasi browser/iframe dan tidak umum tersedia di ponsel; fallback menggunakan joystick serta geser. Izin Pointer Lock memerlukan klik pengguna. Kontrol mobile diuji lewat emulasi browser, belum lewat perangkat iOS/Android fisik. Rendering perangkat lunak di lingkungan pengujian lambat dan tidak mewakili FPS pada GPU pengguna. Ini prototipe latihan satu arena dengan robot penjaga statis, bukan AI navigasi atau game komersial lengkap. Payload JavaScript termasuk engine 3D sekitar 515 KB sebelum gzip.

## Aset dan lisensi

Geometri, layout arena, branding, CSS, dan audio dibuat prosedural untuk proyek ini. Tidak mengambil aset, level, HUD, atau kode game komersial. Tidak ada kode Growlander yang disalin/diubah. Kode proyek berlisensi MIT; Three.js dan dependensi mengikuti lisensi masing-masing dalam paketnya.

Referensi API: [Three.js Raycaster](https://threejs.org/docs/pages/Raycaster.html) dan [MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API).
