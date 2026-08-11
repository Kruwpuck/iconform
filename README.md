# PDL FORM

Sistem pembuatan dan pengarsipan surat untuk **PLN Icon Plus SBU Regional Jawa
Barat**. Petugas mengisi form di web, sistem mengisi master DOCX resmi,
mengonversinya ke PDF, menempelkan tanda tangan + stempel hasil unggahan, lalu
mengarsipkan kedua berkas ke Google Drive sambil mencatat metadatanya di
database.

## Cara kerja

```
form (browser)
  → docxtemplater mengisi {tag} di master .docx    (templates/docx/*.docx)
  → LibreOffice headless mengonversi .docx → .pdf
  → pdf-lib menempelkan ttd/stempel di posisi hasil geser pada editor
  → dua berkas (.docx + .pdf) diunggah ke Google Drive
  → metadata (nama berkas, folder, pemilik, tanggal) disimpan di Postgres
```

Catatan penting soal tanda tangan/stempel: pada **PDF**, posisi hasil geser di
editor benar-benar dipakai — markanya diblanking dari body lalu ditempel ulang
oleh pdf-lib di koordinat itu. Pada **DOCX**, markanya tetap ditanam inline di
tempat template ("in front of text" / anchor floating) supaya Word yang
membukanya tetap merapikan tata letak sendiri; posisi geser sengaja **tidak**
berlaku di DOCX. Lihat komentar di `src/server/infra/docxgen.ts`.

## Jenis surat

Delapan master di `templates/docx/`: Surat Tugas, BAI (Instalasi–Aktivasi),
BAKL (Kendala Lapangan), BAP, BAST, BA Pengujian, NODIN, dan UID Jabar.

## Struktur folder

```
src/
├─ app/         routing Next.js App Router saja — page & route handler tipis,
│                mendelegasikan ke server/services
├─ ui/          komponen React (sidebar, tabel dokumen, editor form+preview)
├─ domain/      logika murni, tanpa I/O — aman diimpor dari browser maupun
│                server (mis. definisi template, validasi input)
└─ server/
   ├─ auth.ts        konfigurasi NextAuth
   ├─ services/      orkestrasi use-case (buat/ubah/hapus dokumen, preview,
   │                  rebuild-untuk-download) — dipanggil oleh route handler
   └─ infra/         Prisma, Google Drive, Google Sheets, pipeline docxgen
```

Arah dependensi satu arah: `app` → `services` → `infra`; siapa pun boleh
mengimpor `domain`, tapi `domain` tidak mengimpor apa pun dari `server`
maupun `ui`. Setiap file di `server/**` memuat `import 'server-only'` di
baris pertama — kalau ada komponen klien tidak sengaja mengimpornya, build
Next.js gagal dengan pesan jelas, bukan diam-diam ikut ke bundle browser.

`templates/`, `prisma/`, `certs/`, `public/` tetap di root: dirujuk langsung
lewat `process.cwd()` (`docxgen.ts`) dan disalin apa adanya oleh `Dockerfile`.

`scripts/` sebagian besar berisi operasi sekali-pakai atas file master DOCX
(perbaikan struktur OOXML) — bukan kode aplikasi. `urutkan_ppr.py` merapikan
urutan elemen `pPr` sesuai skema Word, `satukan_mark.py` menyatukan pasangan
tanda tangan+stempel jadi satu paragraf; keduanya idempoten dan aman
dijalankan ulang kalau master DOCX berubah lagi.

## Prasyarat

- **Ubuntu / Linux server**: Docker Engine + Compose plugin (`apt install docker.io docker-compose-plugin`)
- **Windows**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) (sudah termasuk Compose)

## Menjalankan

Sama di Ubuntu maupun Windows:

```bash
cp .env.example .env   # opsional untuk coba-coba; wajib untuk produksi
# edit .env — minimal isi AUTH_SECRET, POSTGRES_PASSWORD, ADMIN_PASSWORD

docker compose up -d --build
```

Aplikasi jalan di **http://localhost:3000** — login: `admin` / `admin123` (default).

`.env` **opsional** — tanpa itu aplikasi tetap jalan dengan nilai default aman.
Wajib diisi sebelum dipakai produksi sungguhan.

## Variabel lingkungan

Salin `.env.example` → `.env` lalu isi:

| Variabel | Wajib? | Catatan |
|---|---|---|
| `AUTH_SECRET` | Hanya prod | `openssl rand -base64 32`. Di Windows tanpa WSL: `docker run --rm alpine sh -c "apk add -q openssl && openssl rand -base64 32"` |
| `POSTGRES_PASSWORD` | Hanya prod | Default `iconform_dev` cukup untuk dev |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | Hanya prod | Default `admin` / `admin123` |
| `GDRIVE_OAUTH_*` | Opsional | Aplikasi tetap jalan dan preview tetap berfungsi tanpa ini. Upload ke Drive aktif begitu diisi. |
| `GDRIVE_FOLDER_*_ID` | Opsional | Satu folder ID per jenis dokumen |

**Setup Google Drive**: ambil refresh token lewat
`node scripts/get-refresh-token.mjs <oauth-client.json>`, lalu isi
`GDRIVE_OAUTH_*` dan `GDRIVE_FOLDER_*_ID` di `.env`.

## Root CA korporat di image

`Dockerfile` mempercayai root CA **Trend Micro Web Security Cloud**
(`certs/tmws-root-ca.crt`) supaya `npm`/`apk` bisa fetch di balik proxy
jaringan ini yang membelah TLS. Konsekuensinya: lalu lintas TLS *dari dalam
proses build* bisa dibaca proxy tersebut — bukan lalu lintas aplikasi saat
berjalan. Kalau build dijalankan di luar jaringan ini, baris 7–9 Dockerfile
(`COPY certs/…`, `RUN cat …`, `ENV NODE_EXTRA_CA_CERTS=…`) bisa dihapus.

## Operasional (Ubuntu/production)

- Set `AUTH_TRUST_HOST=true` (sudah default di `.env.example`) kalau di
  belakang reverse proxy (Caddy/nginx men-terminate TLS → port 3000).
- `restart: unless-stopped` — app dan DB bertahan setelah reboot.
- Data persisten di volume Docker `pgdata` (Postgres) dan `docdata` (berkas
  sementara).

## Dev di Windows

Alur prod-only — edit kode lokal, lalu rebuild untuk tes:

```bash
docker compose up -d --build
```

Tidak ada container hot-reload. Line ending CRLF ditangani `.gitattributes`
(LF dipaksakan).

## Perintah operasional

Pakai `deploy.ps1` (Windows) atau `deploy.sh` (Linux):

```bash
./deploy.ps1              # git pull, rebuild, restart (default)
./deploy.ps1 rebuild      # rebuild image + restart, tanpa git pull
./deploy.ps1 up           # start container tanpa rebuild
./deploy.ps1 down         # stop semua
./deploy.ps1 logs         # tail log aplikasi
./deploy.ps1 migrate      # terapkan schema ke DB (prisma db push)
./deploy.ps1 seed         # jalankan seed script di container
./deploy.ps1 psql         # buka shell psql ke DB
./deploy.ps1 status       # status container
```

Perintah manual setara:

```bash
# Lihat log
docker compose logs -f iconform-app

# Restart app saja (setelah ubah config)
docker compose restart iconform-app

# Stop semua (data tetap)
docker compose down

# Reset total — MENGHAPUS semua data dan DB
docker compose down -v
```

## Test

Satu-satunya test di repo, atas logika murni di `src/domain/templates.ts`:

```bash
npm test
```
