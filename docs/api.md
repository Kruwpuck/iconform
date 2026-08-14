# Rujukan API

Semua endpoint HTTP yang disediakan aplikasi, beserta syarat autentikasi, bentuk request,
bentuk response, dan setiap kode galat yang bisa keluar. Untuk gambaran bagaimana potongan
sistemnya saling terhubung, baca [architecture.md](architecture.md).

Semua path relatif terhadap akar aplikasi. Lewat Docker Compose, akarnya
`http://localhost` (Caddy di porta 80).

---

## Model autentikasi

Autentikasi memakai cookie sesi NextAuth berstrategi JWT, berumur 8 jam. Tidak ada API
key, tidak ada bearer token, dan tidak ada endpoint yang bisa dipanggil tanpa login.

Ada dua tingkat hak akses, dan keduanya tidak berasal dari kolom role.

| Tingkat | Cara ditentukan | Diperiksa oleh |
|---|---|---|
| Pengguna terautentikasi | punya cookie sesi yang sah | `auth()` di dalam handler |
| Admin seed | `User.createdById === null`, jadi hanya akun hasil seed | `requireSeedAdmin()` |

Hanya ada satu admin selamanya. Setiap akun yang dibuat lewat antarmuka menyimpan id admin
di `createdById`, sehingga tidak akan pernah lolos pemeriksaan admin.

Di luar pemeriksaan di dalam handler, `src/middleware.ts` menyaring hampir semua permintaan
lebih dulu. Permintaan tanpa sesi dialihkan ke `/login`. Yang dikecualikan dari middleware:
`/login`, `/api/auth/*`, aset statis Next.js, dan berkas gambar.

### Tiga hal yang mudah disalahsangka

Ini ditulis terang-terangan karena pembaca biasanya menduga sebaliknya.

**Pembacaan dokumen tidak difilter per pemilik.** `GET /api/documents`,
`GET /api/documents/{id}`, dan `GET /api/documents/{id}/download` hanya memeriksa ada
tidaknya sesi. Setiap pengguna yang login bisa membaca dan mengunduh dokumen siapa pun.
Pemeriksaan kepemilikan hanya ada di `PUT` dan `DELETE`.

**`GET /api/admin/logs` sengaja terbuka** untuk semua pengguna yang login, walaupun path-nya
berawalan `/api/admin`. Log aktivitas diperlakukan sebagai fitur biasa, bukan fitur admin.
Isinya memuat aktivitas semua pelaku, bukan hanya milik pemanggil.

**`GET /api/nomor` tidak memanggil `auth()` sama sekali.** Perlindungannya sepenuhnya
bergantung pada middleware. Kalau matcher middleware suatu saat diubah, endpoint ini
langsung terbuka tanpa ada yang menahannya di dalam handler.

---

## Dokumen

### GET /api/documents

Daftar dokumen dengan pencarian, penyaringan, pengurutan, dan paginasi. Juga menyediakan
daftar bulan yang punya arsip.

**Auth:** sesi apa pun.

**Parameter kueri**

| Nama | Nilai | Default | Catatan |
|---|---|---|---|
| `distinctMonths` | `1` | tidak aktif | kalau `1`, seluruh parameter lain diabaikan dan yang dikembalikan hanya daftar bulan |
| `search` | teks bebas | `''` | cocok sebagian pada `filename`, tidak peka huruf besar kecil |
| `folder` | `SURAT_TUGAS` atau `BERITA_ACARA` | tanpa filter | nilai di luar enum diabaikan diam-diam |
| `template` | anggota `TemplateType` | tanpa filter | nilai di luar enum diabaikan diam-diam |
| `month` | `YYYY-MM` | tanpa filter | harus cocok pola `^\d{4}-\d{2}$`, rentangnya dihitung dalam UTC |
| `sort` | `filename` atau `createdAt` | `createdAt` | nilai lain jatuh ke `createdAt` |
| `dir` | `asc` atau `desc` | `desc` | nilai lain jatuh ke `desc` |
| `page` | bilangan | `1` | dijepit minimum 1 |
| `pageSize` | bilangan | `10` | dijepit antara 1 dan 100 |

**Response, jalur biasa, 200**

```json
{ "items": [ { "id": "...", "filename": "...", "folder": "BERITA_ACARA", "...": "..." } ],
  "total": 42, "page": 1, "pageSize": 10 }
```

Setiap elemen `items` adalah baris `Document` utuh, termasuk `webViewLinkPdf` dan
`webViewLinkDocx`.

**Response, jalur `distinctMonths=1`, 200**

```json
{ "months": ["2026-08", "2026-07", "2026-06"] }
```

Diurutkan terbaru lebih dulu. Perlu diingat bahwa `createdAt` berisi tanggal surat, bukan
waktu barisnya dibuat, sehingga daftar ini mengikuti tanggal surat.

**Galat**

| Kode | Body |
|---|---|
| 401 | `{"error":"Unauthorized"}` |

### POST /api/documents

Buat dokumen baru: render, unggah ke Drive, simpan barisnya.

**Auth:** sesi apa pun. Pembuatnya dicatat dari sesi, bukan dari body.

**Body**

| Bidang | Tipe | Wajib | Aturan |
|---|---|---|---|
| `filename` | string | ya | dibersihkan lebih dulu: karakter kendali dan `/ \ : * ? " < > \|` dibuang, `..` dibuang, spasi berlebih dirapatkan, dipotong 150 karakter. Kalau hasilnya kosong, ditolak |
| `template` | string | ya | harus anggota enum `TemplateType` **dan** punya definisi template. `NODIN` lolos enum tapi tidak punya definisi, jadi tetap ditolak |
| `data` | objek string ke string | tidak | isi formulir. Termasuk tanda tangan (`ttd`, `stempel`, `ttd2`, `stempel2`, `logoMitra`), posisinya (`<nama>Pos`), ukurannya (`<nama>Size`), dan grup berulang (`_group_*` berupa JSON) |
| `logo` | data-URI atau `null` | tidak | hanya `png`, `jpeg`, `jpg`, `webp`, maksimum 2 MB. SVG ditolak |

Ukuran seluruh body dibatasi 10 MB, diperiksa lewat header `Content-Length`.

**Response 201:** baris `Document` yang baru dibuat.

**Galat**

| Kode | Body | Sebab |
|---|---|---|
| 401 | `{"error":"Unauthorized"}` | tanpa sesi |
| 413 | `{"error":"payload too large"}` | `Content-Length` di atas 10 MB |
| 400 | `{"error":"invalid JSON"}` | body bukan objek |
| 400 | `{"error":"filename required"}` | `filename` kosong sesudah dibersihkan |
| 400 | `{"error":"invalid template"}` | template tidak dikenal atau tanpa definisi |
| 400 | `{"error":"invalid logo"}` | tipe MIME salah atau melewati 2 MB |
| 500 | `{"error":"Drive folder ID not configured"}` | tidak ada variabel folder Drive yang cocok untuk template itu |

**Efek samping:** dua berkas naik ke Drive, satu baris `AuditLog` bertindakan
`DOC_CREATE`. Kalau tulis database gagal sesudah unggah berhasil, kedua berkas Drive
dihapus kembali supaya tidak ada berkas yatim.

### GET /api/documents/{id}

Ambil satu baris dokumen.

**Auth:** sesi apa pun. **Tidak** ada pemeriksaan kepemilikan.

**Response 200:** baris `Document`.

**Galat:** 401 `{"error":"Unauthorized"}`, 404 `{"error":"Not found"}`.

### PUT /api/documents/{id}

Ganti isi dokumen: render ulang, unggah yang baru, hapus yang lama.

**Auth:** sesi, **dan** `Document.createdById` harus sama dengan id pemanggil.

**Body:** sama persis dengan `POST /api/documents`.

**Response 200:** baris `Document` yang sudah diperbarui.

**Galat**

| Kode | Body | Sebab |
|---|---|---|
| 401 | `{"error":"Unauthorized"}` | tanpa sesi |
| 404 | `{"error":"Not found"}` | id tidak ada |
| 403 | `{"error":"Forbidden"}` | bukan milik pemanggil |
| 400 dan 413 | sama seperti `POST` | validasi body |
| 500 | `{"error":"Drive folder ID not configured"}` | folder Drive tidak terkonfigurasi |

**Efek samping:** pasangan berkas baru diunggah, baris diperbarui, lalu dua berkas Drive
lama dihapus. Ini pola ganti, bukan versi: riwayat berkas lama tidak disimpan. Satu baris
`AuditLog` bertindakan `DOC_EDIT`.

Mengubah bidang tanggal surat ikut memindahkan `createdAt`, jadi dokumennya pindah bulan
arsip.

### DELETE /api/documents/{id}

**Auth:** sesi, **dan** harus pemilik dokumen.

**Response 204:** tanpa body.

**Galat:** 401 `{"error":"Unauthorized"}`, 404 `{"error":"Not found"}`,
403 `{"error":"Forbidden"}`.

**Efek samping:** untuk BA Pengujian, seluruh subfolder per dokumen dihapus kalau nama
foldernya sama dengan nama berkas dokumen. Untuk template lain, dua berkas dihapus satu per
satu. Lalu barisnya dihapus dan satu `AuditLog` bertindakan `DOC_DELETE` dicatat.

### GET /api/documents/{id}/download

Unduh satu sisi pasangan berkas.

**Auth:** sesi apa pun. **Tidak** ada pemeriksaan kepemilikan.

**Parameter kueri:** `type`, wajib, harus `pdf` atau `docx`.

**Response 200:** isi berkas biner.

| Header | Nilai |
|---|---|
| `Content-Type` | `application/pdf`, atau `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `Content-Disposition` | `attachment; filename="<nama tersandi URL>.<type>"` |

Berkasnya **dihasilkan ulang** dari data formulir tersimpan, bukan diambil dari Drive.
Itu disengaja: perbaikan pada master DOCX ikut sampai ke dokumen yang diarsipkan sebelum
perbaikan itu ada. Kalau penghasilan ulang tidak mungkin, misalnya pada baris warisan yang
`contentHtml`-nya bukan JSON formulir yang bisa dipakai, endpoint jatuh ke mengalirkan
salinan dari Drive.

**Galat:** 401 `{"error":"Unauthorized"}`, 400 `{"error":"type must be pdf or docx"}`,
404 `{"error":"Not found"}`.

### POST /api/documents/preview

Render pratinjau tanpa menyimpan apa pun.

**Auth:** sesi apa pun.

**Parameter kueri:** `format`. Kalau nilainya `pages`, hasilnya PNG per halaman. Nilai lain
atau tanpa parameter menghasilkan PDF utuh.

**Body:** `template`, `data`, dan `logo`, artinya sama seperti `POST /api/documents`.
Bidang `filename` tidak dipakai.

**Response 200, `format=pages`**

```json
{ "pages": ["data:image/png;base64,...", "data:image/png;base64,..."] }
```

**Response 200, tanpa `format=pages`:** PDF biner dengan
`Content-Type: application/pdf`.

**Galat:** 401 `{"error":"Unauthorized"}`, 400 `{"error":"invalid template"}`.

Perhatikan satu ketidaksetaraan dengan `POST /api/documents`: endpoint ini **tidak**
menerapkan batas body 10 MB dan **tidak** memvalidasi logo. Selain itu, kegagalan renderer,
misalnya `soffice` atau `pdftoppm` mati, muncul sebagai galat 500 tanpa pesan yang
menjelaskan.

Pada mode `pages`, tanda tangan yang punya posisi geser dikosongkan dari badan dokumen
karena antarmuka menggambarnya sendiri sebagai lapisan di atas gambar. Tanda tangan tanpa
posisi geser tetap ikut dirender di tempat aslinya, persis seperti hasil PDF yang disimpan.

---

## Nomor surat

### GET /api/nomor

Daftar nomor surat untuk autocomplete, dibaca dari kolom A tab pertama spreadsheet.

**Auth:** tidak ada pemeriksaan di dalam handler, hanya middleware.

**Response 200:** array string, misalnya `["052101/STG/008/SUJBBICON+/2026", "..."]`.

**Galat:** tidak ada. Endpoint ini **selalu** menjawab 200. Setiap kegagalan, entah
`GDRIVE_SHEET_NOMOR_ID` kosong, kredensial salah, atau Sheets API mati, berubah menjadi
array kosong. Hasil `[]` karena itu ambigu: bisa berarti daftarnya memang kosong, bisa
berarti konfigurasinya salah.

Respons di-cache 60 detik supaya setiap ketikan tidak memanggil Sheets API.

---

## Log aktivitas

### GET /api/admin/logs

**Auth:** sesi apa pun. Bukan hanya admin, walaupun path-nya berawalan `/api/admin`.

**Response 200:** array `AuditLog`, terbaru lebih dulu, maksimum 200 entri.

```json
[ { "id": "...", "action": "DOC_CREATE", "target": "BAP_A121201000003",
    "actorId": "...", "actorName": "Budi", "createdAt": "2026-08-13T04:11:00.000Z" } ]
```

Nilai `action` yang mungkin: `DOC_CREATE`, `DOC_EDIT`, `DOC_DELETE`, `USER_CREATE`,
`USER_EDIT`, `USER_DELETE`, `USER_RESET_PW`.

**Galat:** 401 `{"error":"Unauthorized"}`.

---

## Kelola akun

Kedua endpoint di bawah hanya bisa dipakai admin seed, dan hanya bisa menyentuh akun yang
diprovisikan admin itu sendiri.

### GET /api/admin/users

**Auth:** admin seed.

**Response 200**

```json
[ { "id": "...", "username": "budi", "name": "Budi Santoso", "email": null,
    "mustChangePassword": true, "createdAt": "2026-08-01T00:00:00.000Z" } ]
```

Hanya akun ber-`createdById` sama dengan id admin, terbaru lebih dulu.

**Galat:** 403 `{"error":"Forbidden"}`.

### POST /api/admin/users

Buat akun baru dengan password acak sekali pakai.

**Auth:** admin seed.

**Body**

| Bidang | Tipe | Wajib | Aturan |
|---|---|---|---|
| `username` | string | ya | dijadikan huruf kecil, harus cocok `^[a-z0-9_.-]{3,32}$` |
| `name` | string | ya | tidak boleh kosong sesudah dipangkas |
| `email` | string | tidak | kosong menjadi `null` |

**Response 200**

```json
{ "id": "...", "username": "budi", "name": "Budi Santoso", "password": "9f3a...c1" }
```

Bidang `password` adalah teks terang 32 karakter heksadesimal dan **hanya dikembalikan
sekali ini**. Tidak ada cara membacanya lagi nanti. Akun dibuat dengan
`mustChangePassword: true`, sehingga pemegangnya dipaksa menggantinya saat login pertama.

**Galat**

| Kode | Body |
|---|---|
| 403 | `{"error":"Forbidden"}` |
| 400 | `{"error":"Username 3-32 char, huruf/angka/._- saja"}` |
| 400 | `{"error":"Nama wajib diisi"}` |
| 409 | `{"error":"Username sudah dipakai"}` |

Mencatat `AuditLog` bertindakan `USER_CREATE`.

### PATCH /api/admin/users/{id}

Ubah data akun, atau reset password-nya.

**Auth:** admin seed, dan targetnya harus akun yang diprovisikan admin itu.

**Body**, semua bidang opsional dan hanya yang disertakan yang diubah:

| Bidang | Tipe | Efek |
|---|---|---|
| `name` | string | ganti nama, kosong ditolak |
| `email` | string atau kosong | kosong menjadi `null` |
| `username` | string | ganti username, aturannya sama seperti saat pembuatan |
| `resetPassword` | boolean | kalau `true`, password diganti acak dan `mustChangePassword` dinyalakan |

**Response 200:** `{"ok":true}`, atau `{"ok":true,"password":"<heksadesimal>"}` kalau
`resetPassword` dipakai. Password ini pun hanya ditampilkan sekali.

**Galat**

| Kode | Body |
|---|---|
| 403 | `{"error":"Forbidden"}` |
| 404 | `{"error":"User tidak ditemukan"}` |
| 400 | `{"error":"Nama wajib diisi"}` |
| 400 | `{"error":"Username 3-32 char, huruf/angka/._- saja"}` |
| 409 | `{"error":"Username sudah dipakai"}` |

Mencatat `USER_RESET_PW` kalau password direset, `USER_EDIT` kalau tidak.

### DELETE /api/admin/users/{id}

**Auth:** admin seed, dan targetnya harus akun yang diprovisikan admin itu.

**Response 200:** `{"ok":true}`.

**Galat**

| Kode | Body | Sebab |
|---|---|---|
| 403 | `{"error":"Forbidden"}` | bukan admin seed |
| 400 | `{"error":"Tidak bisa hapus diri sendiri"}` | id target sama dengan id admin |
| 404 | `{"error":"User tidak ditemukan"}` | akun tidak ada atau bukan provisi admin ini |

**Efek samping:** dokumen milik akun itu dialihkan kepemilikannya ke admin lebih dulu,
supaya riwayat arsipnya tidak hilang bersama akunnya. Baru setelah itu akunnya dihapus dan
`USER_DELETE` dicatat.

---

## Password sendiri

### GET /api/user/reset-password

Konteks untuk halaman ganti password.

**Auth:** sesi apa pun.

**Response 200:** `{"forced":true}` kalau ini ganti password wajib saat login pertama,
`{"forced":false}` kalau sukarela.

**Galat:** 401 `{"error":"Unauthorized"}`, termasuk saat sesinya ada tapi baris
penggunanya tidak.

### POST /api/user/reset-password

Ganti password sendiri.

**Auth:** sesi apa pun.

**Body**

| Bidang | Tipe | Aturan |
|---|---|---|
| `currentPassword` | string | harus cocok dengan hash yang tersimpan |
| `newPassword` | string | minimal 8 karakter |

**Response 200:** `{"ok":true}`. Menulis hash baru dan mematikan `mustChangePassword`.

**Galat**

| Kode | Body |
|---|---|
| 401 | `{"error":"Unauthorized"}` |
| 400 | `{"error":"Password baru minimal 8 karakter"}` |
| 400 | `{"error":"Password saat ini salah"}` |

Urutan pemeriksaannya panjang password lebih dulu, baru pencocokan password sekarang.

Ganti password tidak lagi memerlukan kode dua faktor. Fitur 2FA sudah dibuang dari sistem
ini, termasuk kolom `totpSecret` dan `twoFactorEnabled` di database serta endpoint
`/api/user/2fa` yang dulu ada. Kalau Anda menemukan dokumen atau kode yang masih
menyebutnya, itu sisa yang belum diperbarui.

Untuk akun admin seed ada satu catatan penting: skrip seed berjalan setiap container boot
dan menimpa password admin dengan nilai `ADMIN_PASSWORD` di `.env`. Mengganti password
admin lewat endpoint ini karena itu tidak bertahan melewati restart. Rinciannya di
[setup.md](setup.md) langkah 11.

---

## Autentikasi bawaan NextAuth

### /api/auth/*

Ditangani NextAuth, bukan kode di repo ini. Sub-path yang tersedia mencakup
`/api/auth/signin`, `/api/auth/signout`, `/api/auth/session`, `/api/auth/csrf`,
`/api/auth/providers`, dan `/api/auth/callback/credentials`.

Satu-satunya provider yang terdaftar adalah `credentials`, dengan dua bidang: `username`
dan `password`.

Seluruh cabang ini dikecualikan dari middleware, karena kalau tidak, proses login akan
mengalihkan dirinya sendiri tanpa henti.

**Pembatasan laju:** lima kegagalan berurutan untuk satu username mengunci username itu 15
menit. Penghitungnya disimpan di memori proses, jadi hilang saat restart dan hanya benar
untuk satu instance. Kuncinya berbasis username, bukan alamat IP, karena header IP tidak
bisa dipercaya di belakang proxy.
