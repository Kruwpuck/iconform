# Panduan setup dari nol

Dokumen ini membawa Anda dari repo yang baru di-clone sampai bisa membuat surat pertama
yang tersimpan di Google Drive. Ditulis dengan asumsi Anda belum punya project Google
Cloud, belum punya folder Drive, dan belum pernah menjalankan aplikasinya.

Perkiraan waktu: 30 sampai 45 menit, sebagian besar habis di konsol Google Cloud.

Kalau Anda mencari hal lain:

- Cara sistemnya bekerja di dalam: [architecture.md](architecture.md)
- Daftar endpoint HTTP: [api.md](api.md)
- Perintah deploy, backup, dan mengubah template: [operations.md](operations.md)

---

## 0. Yang perlu disiapkan lebih dulu

| Kebutuhan | Versi minimum | Kenapa |
|---|---|---|
| Docker Engine + Compose | **Compose 2.24** | `docker-compose.yml:26-28` memakai sintaks `env_file` bentuk panjang (`- path: .env` dengan `required: false`). Compose yang lebih tua gagal mem-parse berkasnya, bukan sekadar mengabaikan |
| Git | apa saja | mengambil kode |
| Node.js | 20 | hanya dipakai sekali, untuk menjalankan skrip pengambil refresh token di host |
| Akun Google | biasa atau Workspace | pemilik folder arsip. Berkas yang diunggah memakai kuota penyimpanan akun ini |

Periksa versi Compose Anda:

```bash
docker compose version
```

Kalau angkanya di bawah 2.24, perbarui Docker dulu. Melanjutkan dengan versi lama hanya
menghasilkan galat parse yang membingungkan.

---

## 1. Ambil kode dan siapkan berkas .env

```bash
git clone <url-repo> iconform
cd iconform
cp .env.example .env
```

Biarkan `.env` apa adanya dulu. Sepanjang panduan ini Anda akan mengisinya sedikit demi
sedikit, dan tiap langkah menghasilkan nilai untuk baris berikutnya.

Berkas `.env` tidak ikut ter-commit (`.gitignore:4`) dan tidak ikut masuk image Docker
(`.dockerignore`). Isinya rahasia; jangan pernah menempelkannya ke tiket, chat, atau
lampiran laporan.

---

## 2. Buat project Google Cloud

1. Buka [console.cloud.google.com](https://console.cloud.google.com).
2. Klik pemilih project di bilah atas, lalu **New Project**.
3. Beri nama, misalnya `pdl-form-arsip`. Organisasi boleh dibiarkan default.
4. Klik **Create**, tunggu sampai notifikasinya selesai, lalu pastikan project baru itu
   yang aktif di pemilih project.

Semua langkah berikutnya harus dilakukan di project ini. Kalau Anda tersesat, cek nama
project di bilah atas sebelum mengklik apa pun.

---

## 3. Aktifkan dua API yang dipakai

Buka **APIs & Services** lalu **Library**, cari dan aktifkan keduanya:

- **Google Drive API**, untuk mengunggah dan menghapus berkas arsip.
- **Google Sheets API**, untuk membaca daftar nomor surat.

Sheets API tetap wajib diaktifkan walaupun aplikasi hanya meminta satu scope Drive.
`src/server/infra/sheets.ts` memanggil endpoint Sheets v4 dengan kredensial yang sama;
scope `drive` diterima oleh Sheets, tapi API-nya tetap harus hidup di project ini. Kalau
dilewati, autocomplete nomor surat mati tanpa pesan galat.

---

## 4. Atur OAuth consent screen

Masih di **APIs & Services**, buka **OAuth consent screen**.

1. Pilih **External**, lalu **Create**.
2. Isi nama aplikasi, email dukungan, dan email kontak developer. Bidang lain boleh
   dilewati.
3. Di halaman **Scopes**, jangan tambahkan apa pun. Scope diminta oleh skrip saat
   pertukaran token, bukan dari halaman ini.
4. Di halaman **Test users**, klik **Add users** dan **masukkan alamat email akun Google
   yang akan memiliki folder arsip**.

Langkah nomor 4 mudah dilewatkan dan akibatnya baru terasa seminggu kemudian. Selama
publish status masih `Testing`, refresh token yang diterbitkan untuk aplikasi yang belum
diverifikasi Google **kedaluwarsa dalam 7 hari**. Kalau tiba-tiba semua penyimpanan gagal
padahal sebelumnya lancar, inilah penyebab pertama yang perlu dicurigai. Solusinya:
tambahkan akun sebagai test user, lalu ulangi langkah 6 untuk mendapatkan token baru.

---

## 5. Buat OAuth client

Buka **APIs & Services** lalu **Credentials**.

1. Klik **Create Credentials**, pilih **OAuth client ID**.
2. **Application type: Desktop app**. Ini bukan pilihan bebas. Skrip pengambil token
   membaca kunci `installed` dari berkas JSON, dan hanya tipe Desktop app yang
   menghasilkan kunci itu.
3. Beri nama, misalnya `pdl-form-cli`.
4. Setelah dibuat, buka client-nya dan tambahkan **Authorized redirect URI** dengan nilai
   persis:

   ```
   http://localhost:53682
   ```

   Tanpa garis miring di belakang dan tanpa path. Nomor port itu di-hardcode di
   `scripts/get-refresh-token.mjs` sebagai `PORT = 53682`; kalau berbeda satu karakter
   pun, Google menolak pengalihan dengan galat `redirect_uri_mismatch`.
5. Klik **Download JSON** dan simpan berkasnya di tempat yang mudah dijangkau, misalnya
   `~/oauth-client.json`. Jangan taruh di dalam folder repo.

---

## 6. Ambil refresh token

Skrip ini mengimpor `googleapis`, jadi dependency harus terpasang di host lebih dulu.

```bash
npm install
node scripts/get-refresh-token.mjs ~/oauth-client.json
```

Yang terjadi berikutnya:

1. Skrip mencetak satu URL persetujuan. Buka di peramban, masuk dengan akun Google yang
   tadi didaftarkan sebagai test user, lalu setujui aksesnya.
2. Google mengalihkan peramban ke `http://localhost:53682`, tempat skrip sedang menunggu.
   Halamannya akan berbunyi bahwa token sudah dicetak di terminal.
3. Terminal menampilkan tiga baris siap tempel:

   ```
   GDRIVE_OAUTH_CLIENT_ID=...
   GDRIVE_OAUTH_CLIENT_SECRET=...
   GDRIVE_OAUTH_REFRESH_TOKEN=...
   ```

Tempelkan ketiganya ke `.env`, menimpa baris kosong yang sudah ada.

Scope yang diminta hanya satu, `https://www.googleapis.com/auth/drive`, dengan
`access_type: 'offline'` dan `prompt: 'consent'`. Yang kedua memaksa Google menerbitkan
refresh token walaupun akun itu pernah menyetujui aplikasi yang sama sebelumnya.

Kenapa akun pengguna, bukan service account: service account tidak punya kuota penyimpanan
sendiri di akun Google non-Workspace, jadi unggahannya gagal. Konsekuensinya, berkas arsip
memakai kuota Drive akun yang Anda pakai di langkah ini.

---

## 7. Siapkan folder Drive

Buat foldernya di Drive akun yang sama, lalu buka tiap folder dan ambil ID-nya dari URL:

```
https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^ ini ID-nya
```

Ada dua cara mengatur folder. Pilih salah satu.

**Cara sederhana, dua folder.** Buat satu folder untuk Surat Tugas dan satu untuk semua
Berita Acara, lalu isi dua baris ini saja:

```env
GDRIVE_FOLDER_SURAT_TUGAS_ID=...
GDRIVE_FOLDER_BERITA_ACARA_ID=...
```

**Cara terpisah, satu folder per jenis surat.** Isi juga variabel per template di bawah.
Yang lebih spesifik menang: `resolveFolderId()` di `src/server/infra/gdrive.ts:72-87`
mengembalikan `perTemplate[templateId] ?? perFolder[folder]`.

| Jenis surat | Variabel yang dicek lebih dulu | Kalau kosong, jatuh ke |
|---|---|---|
| Surat Tugas | tidak ada | `GDRIVE_FOLDER_SURAT_TUGAS_ID` |
| BAI (BAI-BAA) | `GDRIVE_FOLDER_BAI_ID` | `GDRIVE_FOLDER_BERITA_ACARA_ID` |
| BAI UID JABAR | `GDRIVE_FOLDER_BAI_ID` (sengaja berbagi folder dengan BAI) | `GDRIVE_FOLDER_BERITA_ACARA_ID` |
| BAKL | `GDRIVE_FOLDER_BAKL_ID` | `GDRIVE_FOLDER_BERITA_ACARA_ID` |
| BAP | `GDRIVE_FOLDER_BAP_ID` | `GDRIVE_FOLDER_BERITA_ACARA_ID` |
| BAST | `GDRIVE_FOLDER_BAST_ID` | `GDRIVE_FOLDER_BERITA_ACARA_ID` |
| BA Pengujian | `GDRIVE_FOLDER_BA_PENGUJIAN_ID` | `GDRIVE_FOLDER_BERITA_ACARA_ID` |

Dua hal yang tidak bisa ditebak dari nama variabelnya. Pertama, BAI UID JABAR tidak punya
variabel sendiri dan selalu memakai folder BAI. Kedua, Surat Tugas tidak punya entri
per-template sama sekali, jadi `GDRIVE_FOLDER_SURAT_TUGAS_ID` wajib diisi.

BA Pengujian bekerja sedikit berbeda: folder yang Anda isi jadi folder induk, dan setiap
dokumen mendapat subfolder sendiri bernama sama dengan nama berkasnya, berisi PDF, DOCX,
dan logo mitra sebagai `logo.png` atau `logo.jpg`.

Kalau tidak ada variabel yang cocok, penyimpanan gagal dengan HTTP 500 dan pesan
`Drive folder ID not configured`.

---

## 8. Siapkan spreadsheet daftar nomor surat

Langkah ini opsional. Kalau dilewati, kolom nomor surat tetap bisa diisi manual, hanya
tidak ada saran otomatis.

1. Buat Google Spreadsheet baru di akun yang sama, atau pakai yang sudah ada.
2. Taruh daftar nomor di **kolom A pada tab pertama**. Satu nomor per baris, tanpa baris
   judul.
3. Ambil ID dari URL dan isi `GDRIVE_SHEET_NOMOR_ID`:

   ```
   https://docs.google.com/spreadsheets/d/1McW4uRr0Ew1V27iVxeNjuN3Vi7ixs6gM/edit
                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ini ID-nya
   ```

Syarat "tab pertama" itu kaku dan tidak bisa dikonfigurasi. `src/server/infra/sheets.ts:5`
memakai `RANGE = 'A:A'` tanpa nama sheet, dan rentang A1 tanpa kualifikasi membuat Sheets
API membaca sheet pertama yang terlihat. Kalau daftar nomor Anda ada di tab kedua,
aplikasi membaca tab yang salah dan mengembalikan daftar kosong tanpa mengeluh.

Kalau spreadsheet-nya milik orang lain, akun OAuth Anda perlu akses minimal **Viewer**.

`GDRIVE_SHEET_NOMOR_ID` dibaca sebagai konstanta tingkat modul, jadi mengubahnya butuh
restart container, bukan sekadar muat ulang halaman.

---

## 9. Isi sisa berkas .env

Empat nilai terakhir.

**`AUTH_SECRET`** menandatangani cookie sesi. Hasilkan yang acak:

```bash
openssl rand -base64 32
```

**`POSTGRES_PASSWORD`** dipakai Compose untuk membuat database sekaligus menyusun string
koneksi. Nilai apa pun boleh, asal bukan default.

**`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME`** menentukan akun admin yang dibuat
otomatis. Password **wajib minimal 12 karakter**. `prisma/seed.ts:12-14` melempar galat
kalau kurang, dan karena `Dockerfile:56` merantai tiga perintah dengan `&&`, seed yang
gagal membuat server tidak pernah menyala. Gejalanya: container berulang kali restart dan
`docker compose logs` menampilkan `ADMIN_PASSWORD must be at least 12 characters`.

**`DATABASE_URL`** biarkan apa adanya. Saat memakai Docker Compose nilai ini
**diabaikan**: `docker-compose.yml:29-30` menimpanya lewat blok `environment`, dan
`environment` menang atas `env_file`. Baris di `.env` hanya berpengaruh kalau Anda
menjalankan `npm run dev` langsung di host tanpa Docker.

Satu variabel lagi yang sudah terisi dan tidak perlu disentuh: `AUTH_TRUST_HOST=true`
dibaca NextAuth sendiri, bukan oleh kode repo ini, dan diperlukan karena aplikasi berjalan
di belakang reverse proxy.

---

## 10. Jalankan

```bash
docker compose up -d --build
```

Build pertama memakan beberapa menit karena image runner memasang LibreOffice dan
poppler-utils. Pantau prosesnya:

```bash
docker compose logs -f iconform-app
```

Saat siap, log menampilkan `Seeded admin user: <username>` lalu baris kesiapan Next.js.

Buka **http://localhost**.

Perhatikan porta: **80**, bukan 3000. Tidak ada service di `docker-compose.yml` yang
mempublikasikan 3000. Yang menerima lalu lintas adalah Caddy di porta 80 dan 443, lalu
meneruskannya ke aplikasi di dalam jaringan Docker. Postgres sengaja tidak dipublikasikan
sama sekali.

---

## 11. Login pertama

Masuk dengan `ADMIN_USERNAME` dan `ADMIN_PASSWORD` dari `.env`. Sistem langsung membawa
Anda ke halaman ganti password, dan Anda tidak bisa membuka halaman lain sebelum
menggantinya. Isi password sekarang, password baru, dan konfirmasinya, lalu masuk ulang.

Ada satu perilaku yang perlu Anda sadari sejak awal. Skrip seed berjalan **setiap kali
container boot**, dan operasinya `upsert`, jadi password admin selalu dikembalikan ke nilai
di `.env` pada restart berikutnya. Artinya:

- Mengganti password admin lewat antarmuka tidak permanen.
- Cara mengganti password admin yang benar adalah mengubah `ADMIN_PASSWORD` di `.env`,
  lalu `docker compose restart iconform-app`.

Untuk akun lain hal ini tidak berlaku. Akun yang dibuat lewat halaman kelola user
menyimpan password-nya di database seperti biasa.

Untuk membuat akun petugas, buka **http://localhost/admin/users**. Menunya sengaja tidak
dipasang di sidebar, jadi URL-nya harus diketik. Setiap akun baru menerima password acak
sekali pakai yang **hanya ditampilkan satu kali**; salin sebelum menutup panelnya.
Pemegang akun akan dipaksa menggantinya saat login pertama.

---

## 12. Pastikan semuanya benar-benar jalan

Tiga pemeriksaan. Yang pertama paling penting karena kegagalan Sheets tidak pernah
menampilkan galat.

**Daftar nomor surat terbaca:**

```bash
curl http://localhost/api/nomor
```

Harus mengembalikan array berisi nomor Anda. Kalau hasilnya `[]` padahal langkah 8 sudah
dikerjakan, berarti ada yang salah: ID keliru, daftar tidak di tab pertama, akun tidak
punya akses, atau Sheets API belum diaktifkan. Endpoint ini menelan semua galat dan tetap
menjawab HTTP 200, jadi tidak ada pesan yang menuntun Anda.

**Satu surat berhasil dibuat:** buka salah satu jenis surat dari sidebar, isi beberapa
bidang, klik simpan. Pastikan barisnya muncul di dasbor.

**Berkas benar-benar sampai di Drive:** buka folder Drive yang bersangkutan. Harus ada dua
berkas dengan nama sama, satu `.pdf` dan satu `.docx`.

---

## 13. Kalau ada yang gagal

| Gejala | Penyebab paling mungkin | Perbaikan |
|---|---|---|
| Container restart terus, log memuat `ADMIN_PASSWORD must be at least 12 characters` | `ADMIN_PASSWORD` kurang dari 12 karakter | Perpanjang, lalu `docker compose up -d` |
| `docker compose` gagal mem-parse berkas Compose | Compose di bawah 2.24, tidak paham `env_file` bentuk panjang | Perbarui Docker |
| Simpan surat gagal, HTTP 500 `Drive folder ID not configured` | Tidak ada variabel folder yang cocok untuk jenis surat itu | Isi variabel per template atau variabel penampung, lihat tabel di langkah 7 |
| Simpan surat gagal, log memuat `GDRIVE_OAUTH_... not set` | Salah satu dari tiga variabel OAuth kosong | Ulangi langkah 6 |
| `/api/nomor` mengembalikan `[]` | ID salah, daftar bukan di tab pertama, akun tanpa akses, atau Sheets API belum aktif | Lihat langkah 3 dan 8 |
| Sebelumnya lancar, lalu semua penyimpanan gagal serentak sesudah sekitar seminggu | Refresh token kedaluwarsa karena akun belum jadi test user | Tambahkan test user di langkah 4, ulangi langkah 6 |
| `redirect_uri_mismatch` saat mengambil token | Redirect URI di OAuth client bukan persis `http://localhost:53682` | Perbaiki di Credentials, hapus garis miring atau path yang terselip |
| Halaman terbuka tapi tampilannya kacau | Build lama tersisa | `docker compose build --no-cache iconform-app` lalu `up -d` |
| DOCX hasil unduhan menolak dibuka di Word padahal PDF-nya normal | Master DOCX diedit tanpa langkah pembenahan OOXML | Lihat bagian mengubah template di [operations.md](operations.md) |

Log aplikasi selalu jadi tempat pertama untuk melihat:

```bash
docker compose logs --tail=100 iconform-app
```

---

## 14. Membangun di luar jaringan berproxy

Image ini mempercayai satu root CA korporat. `Dockerfile:1-9` menyalin
`certs/tmws-root-ca.crt` ke dalam image dan menambahkannya ke bundel CA sistem, karena
Trend Micro Web Security Cloud menandatangani ulang setiap koneksi HTTPS yang keluar dari
VM Docker di jaringan ini. Tanpa itu `apk` dan `npm` gagal dengan
`certificate verify failed`.

Konsekuensinya perlu Anda ketahui: selama sertifikat itu dipercaya, lalu lintas TLS dari
dalam proses build bisa dibaca oleh proxy tersebut.

Kalau Anda membangun di jaringan lain, hapus **ketiga baris 7, 8, dan 9 sekaligus**.
Menghapus berkas sertifikatnya saja tidak cukup, karena `COPY` di baris 7 akan gagal
mencari berkas yang sudah tidak ada.
