# Rencana keamanan

> **Catatan status.** Dokumen ini ditulis lebih awal dalam proyek, waktu sistemnya masih
> bernama "SimSurat" dan arsitekturnya berbeda. Sebagian isinya sudah tidak berlaku dan
> ditandai dengan blok **Sudah berubah** di tempatnya masing-masing. Untuk keadaan sistem
> sekarang, rujuk [architecture.md](architecture.md), [api.md](api.md), dan
> [setup.md](setup.md).

> Prinsip: internal tool, user sedikit, semua di balik login. Jangan pasang security theater. Pasang yang **benar-benar nutup lubang nyata**, semuanya gratis, setup sekali jalan.
>
> Aturan main: bagian **WAJIB** jangan diskip — itu trust boundary. Bagian **NANTI** biarkan kosong sampai trigger-nya nyala.

---

## 0. Model Ancaman (jujur, bukan copy-paste OWASP)

Siapa yang realistis nyerang SimSurat:

| Aktor | Bisa apa | Risiko nyata |
|---|---|---|
| Orang kantor iseng / akun kepinjem | Login pakai password lemah, hapus dokumen orang | **Tinggi** |
| Dev sendiri | Commit `.env` atau JSON service account ke Git | **Tinggi** — ini penyebab bocor nomor 1 |
| User internal usil | Nempel HTML/script ke editor → tersimpan → jalan di browser admin lain | **Sedang-Tinggi** (stored XSS, karena `contentHtml` di-render pakai `dangerouslySetInnerHTML`) |
| Bot internet | Scan port, brute force `/login`, exploit dependency lama | **Sedang** |
| Penyerang canggih bertarget | Pivot ke Google Drive lewat service account | **Rendah**, tapi damage besar |

Yang **bukan** ancaman di sini: multi-tenant data isolation (satu organisasi), DDoS (internal), compliance audit (belum diminta).

---

## 1. WAJIB — Rahasia & Kredensial

Kebocoran kredensial > semua kelas bug lain digabung. Kerjakan ini duluan.

1. **`.gitignore` harus punya:** `.env`, `.env.*`, `*.json` key service account, `*.pem`. Cek `.env.example` sudah ada dan isinya placeholder kosong.
2. **Kredensial Google jangan pernah masuk repo.**

   > **Sudah berubah.** Rencana ini menganggap autentikasi Drive memakai service account
   > lewat `GDRIVE_SERVICE_ACCOUNT_B64`. Variabel itu tidak dibaca kode mana pun lagi.
   > Sistem sekarang memakai kredensial OAuth akun pengguna
   > (`GDRIVE_OAUTH_CLIENT_ID`, `GDRIVE_OAUTH_CLIENT_SECRET`,
   > `GDRIVE_OAUTH_REFRESH_TOKEN`), karena service account tidak punya kuota penyimpanan
   > di akun Google non-Workspace. Cara mendapatkannya ada di
   > [setup.md](setup.md) langkah 5 dan 6.
   >
   > Yang tetap berlaku: berkas JSON OAuth client yang diunduh dari Google Cloud jangan
   > ditaruh di dalam folder repo, dan refresh token diperlakukan sebagai rahasia setara
   > password. Siapa pun yang memegangnya bisa membaca dan menulis seluruh Drive akun itu,
   > karena scope yang diminta `drive` penuh.
3. **Scan history Git — gratis:**
   ```bash
   docker run --rm -v "$PWD:/repo" zricethezav/gitleaks:latest detect -s /repo -v
   ```
   Jalankan sekali sekarang, sekali sebelum repo di-push ke tempat baru. Kalau ketemu secret di history: **rotate secret-nya**, jangan cuma hapus filenya (history tetap nyimpan).
4. **`AUTH_SECRET`:** `openssl rand -base64 32`. Beda antara dev dan production. Jangan yang dari `.env.example`.
5. **Password admin seed:** `ADMIN_PASSWORD=admin123` cuma boleh untuk dev. Sebelum production, ganti env-nya, hapus user lama, seed ulang.
6. **Permission Drive service account:** share hanya **2 folder** target, role Editor. Jangan share My Drive root, jangan bikin service account jadi Editor domain-wide.

// ponytail: skip Vault/Secret Manager. `.env` + file permission `chmod 600` cukup untuk 1 server. Trigger upgrade: lebih dari 1 server atau lebih dari 3 orang punya akses server.

---

## 2. WAJIB — Auth & Session

Sudah ketutup oleh NextAuth + blueprint, tinggal verifikasi:

- [ ] Password disimpan `bcrypt` cost 10, **tidak pernah** di-log, tidak pernah dikirim balik di response API.
- [ ] `authorize()` kembalikan `null` untuk user-tidak-ada **dan** password-salah — pesan error di UI sama persis ("Username atau password salah"). Jangan bocorin user mana yang eksis.
- [ ] `src/middleware.ts` benar-benar nutup semua route kecuali `/login`, `/api/auth/*`, static. **Tes manual:** buka `/api/documents` di incognito → harus 401/redirect, bukan JSON data.
- [ ] Setiap route handler di `/api/documents/*` panggil `auth()` sendiri. Middleware bisa di-bypass kalau matcher salah — cek dua lapis.
- [ ] Cookie session: `httpOnly`, `sameSite: 'lax'`, `secure: true` di production (NextAuth default sudah begini kalau `NEXTAUTH_URL`/`AUTH_URL` pakai `https://` — pastikan begitu).
- [ ] Session umur wajar: 8 jam (jam kerja). `session: { strategy:'jwt', maxAge: 60*60*8 }`.

**Kebijakan password (gratis, nol dependency):** minimal 12 karakter waktu bikin/ganti user. Cek di seed script dan (nanti) di form ganti password. Tidak usah aturan simbol/angka wajib — panjang lebih ngaruh.

> **Sudah berubah.** Rencana ini menunda 2FA. 2FA kemudian dibangun (TOTP dengan `otplib`,
> kolom `totpSecret` dan `twoFactorEnabled`, halaman `/settings/2fa`), lalu **dibongkar
> lagi** karena syarat wajib mengaktifkannya menghalangi pemakai mengganti password
> sendiri. Kode, kolom database, dan dependency-nya sudah dibuang seluruhnya.
>
> Keadaan sekarang: login memakai username dan password saja, dengan pembatas laju lima
> kegagalan per username lalu kunci 15 menit. Ganti password mandiri hanya meminta password
> sekarang dan password baru. Pemicu untuk mempertimbangkan 2FA lagi tetap seperti tertulis
> di bawah: dokumen mulai memuat data yang kebocorannya berkonsekuensi hukum, atau ada
> permintaan dari atasan. Kalau nanti dipasang ulang, jangan jadikan syarat wajib untuk
> mengganti password.

---

## 3. Stored XSS

> **Sudah berubah, dan lubangnya hilang karena arsitekturnya berganti.** Bagian ini
> menganggap pemakai mengetik di `contenteditable`, HTML mentahnya disimpan ke
> `Document.contentHtml`, lalu dirender ulang dengan `dangerouslySetInnerHTML`. Tidak ada
> lagi yang seperti itu: `contenteditable` dan `dangerouslySetInnerHTML` tidak muncul sama
> sekali di `src/`. Pemakai mengisi input formulir biasa, dan `contentHtml` sekarang
> menyimpan `JSON.stringify(data)`, bukan HTML. Nama kolomnya warisan.
>
> Nilai formulirnya tidak pernah dirender sebagai HTML. Yang dilakukan sistem adalah
> menyisipkannya sebagai teks ke dalam XML DOCX lewat docxtemplater. Karena itu
> `isomorphic-dompurify` tidak dipasang, dan `src/lib/sanitize.ts` yang dijanjikan di sini
> tidak pernah ada. Folder `src/lib/` sendiri sudah tidak ada lagi.
>
> Yang **masih berlaku** dari bagian ini adalah validasi unggahan logo di bawah, dan itu
> sudah diterapkan di `src/domain/validate.ts` (`isValidLogo`).

**Validasi upload logo (di server, bukan cuma `accept="image/*"`):**
- `logoBase64` harus match `^data:image\/(png|jpeg|jpg|webp);base64,` — tolak SVG (SVG bisa bawa script).
- Batas ukuran string base64: 2 MB. Lebih dari itu → 400.

---

## 4. WAJIB — Otorisasi & Input di API

- **IDOR:** route `[id]` ambil dokumen by id saja. Sekarang semua user admin jadi masih aman — tapi begitu ada role kedua, ini jadi lubang. Tulis komentar sekarang:
  `// ponytail: semua user setara sekarang; tambah cek createdById saat role kedua muncul`
- **Validasi enum:** `folder` dan `template` dari FormData harus dicek terhadap daftar enum yang valid sebelum masuk Prisma. Nilai asing → 400.
- **Filename:** trim, tolak kosong, buang `/ \ .. : * ? " < > |` dan karakter kontrol. Batasi 150 karakter. Ini bukan cuma soal Drive — nama file masuk ke header `Content-Disposition`, kalau ada `\r\n` bisa jadi header injection.
- **SQL injection:** aman, Prisma parameterized. Jangan pernah pakai `$queryRawUnsafe`.
- **Ukuran upload:** batasi body route dokumen ~10 MB. Di Next.js App Router cek `Content-Length` di awal handler, tolak kalau lewat.

---

## 5. WAJIB — Deployment & Jaringan

Ini bagian yang "gratis dan ga ribet" tapi paling sering dilewat.

1. **HTTPS otomatis pakai Caddy** — gratis, sertifikat Let's Encrypt auto-perpanjang, konfigurasi 3 baris. Tambah ke `docker-compose.yml`:

   ```yaml
     caddy:
       image: caddy:2-alpine
       restart: unless-stopped
       ports: ["80:80", "443:443"]
       volumes:
         - ./Caddyfile:/etc/caddy/Caddyfile
         - caddydata:/data
       depends_on: [app]
   ```
   `Caddyfile`:
   ```
   simsurat.domain-kamu.id {
     reverse_proxy app:3000
   }
   ```
   Lalu **hapus** `ports: ["3000:3000"]` dari service `app` — biar Next.js tidak nongol langsung ke internet.
   Kalau deploy cuma di jaringan internal PLN tanpa domain publik: lewati Caddy, tapi jangan expose port ke internet sama sekali.

2. **Postgres jangan pernah publish port.** Blueprint sudah benar (tidak ada `ports:` di service `db`). Jangan ditambah "buat gampang debug" — kalau perlu akses, `docker compose exec db psql`.

3. **Firewall host (gratis, 4 perintah):**
   ```bash
   sudo ufw default deny incoming
   sudo ufw allow 22/tcp
   sudo ufw allow 80,443/tcp
   sudo ufw enable
   ```

4. **Security header** — Caddy sudah kasih HSTS. Tambah sisanya di `next.config.ts`, satu blok:
   ```ts
   async headers() {
     return [{ source: '/:path*', headers: [
       { key: 'X-Frame-Options', value: 'DENY' },
       { key: 'X-Content-Type-Options', value: 'nosniff' },
       { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
     ]}];
   }
   ```
   // ponytail: skip CSP dulu — Tailwind CDN/inline style bikin CSP ketat jadi proyek sendiri. Trigger: aplikasi jadi public-facing.

5. **Container jalan sebagai non-root** — Dockerfile sudah pakai user `nextjs`. Jangan diubah.

---

## 6. WAJIB — Dependency & Update

Semua gratis, dua-duanya sekali setup:

- **`npm audit`** sebelum tiap deploy. Yang wajib ditindak: severity `high` dan `critical` di dependency runtime. `moderate` di devDependency boleh ditunda.
- **Dependabot** (gratis di GitHub, 1 file):
  ```yaml
  # .github/dependabot.yml
  version: 2
  updates:
    - package-ecosystem: npm
      directory: "/"
      schedule: { interval: weekly }
    - package-ecosystem: docker
      directory: "/"
      schedule: { interval: weekly }
  ```
- **Scan image Docker — gratis:**
  ```bash
  docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
    aquasec/trivy image simsurat-app:latest --severity HIGH,CRITICAL
  ```
  Jalankan waktu build image baru. Basis `node:20-alpine` biasanya bersih.

---

## 7. WAJIB — Backup & Recovery

Security bukan cuma soal nolak penyerang, tapi juga soal masih punya data besok pagi.

- **Postgres dump harian, gratis, 1 baris cron:**
  ```bash
  0 2 * * * docker compose -f /path/docker-compose.yml exec -T db \
    pg_dump -U simsurat simsurat | gzip > /backup/simsurat-$(date +\%F).sql.gz
  ```
  Simpan 14 hari: `find /backup -name '*.sql.gz' -mtime +14 -delete`.
- **Tes restore sekali** setelah setup. Backup yang belum pernah di-restore = belum tentu backup.
- File dokumen sendiri ada di Google Drive — sudah punya versioning + trash 30 hari. Cukup.
- **Kunci pemulihan Drive:** kalau service account key hilang, file tetap ada tapi aplikasi tidak bisa akses. Simpan cadangan key di password manager.

---

## 8. Logging (secukupnya)

- Catat: login gagal (username + waktu + IP), pembuatan/penghapusan dokumen (user id + doc id).
- **Jangan pernah** log: password, isi `AUTH_SECRET`, isi service account, `contentHtml` penuh.
- `console.log` ke stdout sudah cukup — Docker menyimpannya. Batasi rotasi biar disk tidak penuh:
  ```yaml
  logging:
    driver: json-file
    options: { max-size: "10m", max-file: "3" }
  ```

// ponytail: skip Sentry/Grafana/ELK. Trigger: ada insiden yang tidak bisa dijelaskan dari log stdout.

---

## 9. Rate Limit Login (murah, opsional-tapi-disarankan)

Brute force `/login` itu satu-satunya endpoint yang menghadap penyerang otomatis.

Versi paling malas yang beneran jalan — `Map` di memori, tanpa Redis:

```ts
// ponytail: in-memory, reset saat restart, hanya benar untuk 1 instance.
// Upgrade ke Redis kalau nanti ada >1 replica.
const attempts = new Map<string, { n: number; until: number }>();
// 5 gagal per IP → blokir 15 menit
```
Pasang di dalam `authorize()` NextAuth. ~15 baris.

Kalau sudah pakai Caddy, alternatif lebih malas lagi: batasi di level proxy. Pilih salah satu, jangan dua-duanya.

---

## 10. Checklist Sebelum Production

Cetak, centang satu-satu:

- [ ] `gitleaks` bersih, `.env` tidak pernah ter-commit
- [ ] `AUTH_SECRET` production digenerate baru
- [ ] Password admin bukan `admin123`, minimal 12 karakter
- [ ] `/api/documents` ditolak tanpa session (tes incognito)
- [ ] Sanitasi HTML aktif di POST **dan** PUT (tes: kirim `<script>alert(1)</script>` lewat curl → tersimpan bersih)
- [ ] Upload logo tolak SVG dan file > 2 MB
- [ ] Port 3000 dan 5432 tidak terbuka ke internet (`nmap` dari luar / cek `ufw status`)
- [ ] HTTPS jalan, HTTP redirect ke HTTPS
- [ ] `npm audit` tidak ada high/critical di runtime dep
- [ ] Cron backup jalan, sudah pernah tes restore sekali
- [ ] Service account cuma punya akses ke 2 folder Drive

---

## 11. Sengaja Dilewati (dan pemicunya)

| Dilewati | Tambah kalau |
|---|---|
| 2FA / MFA | Data sensitif bertambah, atau diminta compliance. **Catatan:** sempat dipasang, lalu dibongkar; lihat blok di bagian 2 |
| CSP ketat | Aplikasi jadi public-facing |
| WAF (Cloudflare dll) | Terekspos ke internet publik dengan traffic tidak dikenal |
| ~~Audit log ke DB (tabel terpisah)~~ | **Sudah dipasang.** Tabel `AuditLog` mencatat tujuh jenis tindakan dengan snapshot nama pelaku, dan halaman Log Aktivitas menampilkan 200 entri terakhir. Perlu dicatat log itu terbuka untuk semua pengguna yang login, bukan hanya admin |
| RBAC / cek `createdById` | Muncul role kedua (non-admin) |
| Enkripsi kolom DB | Dokumen mulai memuat data pribadi yang diatur regulasi |
| Secret manager (Vault/GCP SM) | Lebih dari 1 server, atau >3 orang punya akses server |
| Pentest eksternal | Sistem dipakai lintas unit / jadi sistem resmi regional |

---

**Urutan kerja kalau waktu mepet:** §1 (rahasia) → §3 (XSS) → §5.1–5.2 (HTTPS + port DB tertutup) → §7 (backup). Empat itu nutup ~90% risiko nyata. Sisanya bisa nyusul.
