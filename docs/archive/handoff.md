# ICONFORM — Project Handoff

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v3 · Prisma + PostgreSQL · Google Drive API v3  
**Unit:** PLN Icon Plus SBU Regional Jawa Barat  
**Purpose:** Web app pengisian dan penyimpanan dokumen administrasi (Surat Tugas & Berita Acara) langsung ke Google Drive.

---

## Cara Jalankan

```bash
# 1. Copy .env.example → .env, isi semua variabel
cp .env.example .env

# 2. Jalankan dengan Docker Compose (rekomendasi)
docker compose up -d --build

# atau dev lokal:
npm install
npx prisma migrate dev
npx tsx prisma/seed.ts   # buat user admin
npm run dev              # http://localhost:3000
```

Login default: `admin` / `admin123` (sesuai `ADMIN_USERNAME`/`ADMIN_PASSWORD` di `.env`).

---

## Variabel Lingkungan (.env)

| Variabel | Keterangan |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Secret NextAuth (generate: `openssl rand -base64 32`) |
| `AUTH_TRUST_HOST` | `true` saat di balik reverse proxy/Docker |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Seed user pertama |
| `NEXT_PUBLIC_ENABLE_EMAIL_AUTH` | `false` — UI email auth disembunyikan |
| `GDRIVE_OAUTH_CLIENT_ID` | Google OAuth2 client ID |
| `GDRIVE_OAUTH_CLIENT_SECRET` | Google OAuth2 client secret |
| `GDRIVE_OAUTH_REFRESH_TOKEN` | Refresh token user account (bukan service account) |
| `GDRIVE_FOLDER_SURAT_TUGAS_ID` | ID folder Drive untuk Surat Tugas |
| `GDRIVE_FOLDER_BERITA_ACARA_ID` | Fallback folder BA jika per-jenis tidak diset |
| `GDRIVE_FOLDER_BAI_ID` | Folder BAI & UID JABAR |
| `GDRIVE_FOLDER_BAKL_ID` | Folder BAKL |
| `GDRIVE_FOLDER_BAP_ID` | Folder BAP |
| `GDRIVE_FOLDER_BA_PENGUJIAN_ID` | Folder BAHP (parent; tiap dokumen dapat subfolder sendiri) |
| `GDRIVE_FOLDER_BAST_ID` | Folder BAST |
| `GDRIVE_FOLDER_NODIN_ID` | Folder Nota Dinas |

> **PENTING — Google Drive:** Harus pakai OAuth2 user credentials. Service account tidak punya storage quota di akun Google personal. Jangan pernah commit file credential ke repo.  
> Untuk generate refresh token: `node scripts/get-refresh-token.mjs <oauth-client.json>`

---

## Struktur File Utama

```
src/
  app/
    (dashboard)/          # Halaman utama (protected) — list dokumen + template grid
    login/                # Halaman login
    api/
      auth/[...nextauth]/ # NextAuth route
      documents/          # GET/POST list, PUT/DELETE by id, GET preview
      documents/preview/  # Render PDF preview (pages sebagai base64 PNG)
      documents/[id]/download/ # Download file dari Drive

  components/
    EditorModal.tsx       # Modal isi formulir template → simpan ke Drive
    DocumentsTable.tsx    # Tabel daftar dokumen dengan search & pagination
    FolderCards.tsx       # Card navigasi per folder
    Sidebar.tsx           # Navigasi sidebar
    TemplateGrid.tsx      # Grid pilihan template

  lib/
    templates.ts          # Definisi semua template (fields, suggestName, file DOCX)
    docxgen.ts            # Render DOCX dari template + stamp TTD/stempel ke PDF
    gdrive.ts             # Upload/delete/stream file Google Drive via OAuth2
    prisma.ts             # Prisma singleton
    storage.ts            # (wrapper storage lokal jika diperlukan)

  auth.ts                 # NextAuth config (credentials provider, JWT strategy)
  middleware.ts           # Proteksi semua route kecuali /login

templates/
  docx/                   # Master DOCX dengan {tag} untuk docxtemplater (8 file)
  Berita Acara/           # File template original (referensi, tidak dipakai langsung)
  TEMPLATE_Surat Tugas_Nama.docx

prisma/
  schema.prisma           # Model: User, Session, Document
  seed.ts                 # Buat admin user

scripts/                  # Script Python one-time untuk edit master DOCX
  retag.py                # Ganti placeholder dots dengan {tag} di 8 master
  retag2.py               # Cleanup sisa literal/dots yang lolos retag.py
  revisi1.py              # Revisi struktur tabel NODIN/BAST
  add-ttd-tags.py         # Tambah {%ttd}/{%stempel} ke master
  tag-bast-nodin.py       # Tag BAST & NODIN
  make-templates.py       # (utility lain)
  get-refresh-token.mjs   # Helper generate Google OAuth refresh token
  inspect-tags.js         # Audit tag di master DOCX
```

---

## Template Dokumen (8 jenis)

Semua template didefinisikan di `src/lib/templates.ts` → array `TEMPLATES`.  
Master DOCX ada di `templates/docx/`.

| id | Label | File DOCX | Folder Drive | Catatan |
|---|---|---|---|---|
| `SURAT_TUGAS` | Surat Tugas | SURAT_TUGAS.docx | SURAT_TUGAS | suggestName = nama petugas 1 |
| `BAI` | BAI (BAI-BAA) | BAI.docx | BAI | suggestName = No PA / Service ID |
| `UID_JABAR` | BAI UID JABAR | UID_JABAR.docx | BAI (reuse) | BAI khusus PLN UID Jabar; default namaPelanggan/instansi prefilled |
| `BAKL` | BAKL | BAKL.docx | BAKL | Pihak pertama/kedua default `............` jika kosong |
| `BA_PENGUJIAN` | BA Pengujian | BA_PENGUJIAN.docx | BA_PENGUJIAN | `allowLogo: true`; logo mitra disimpan di subfolder Drive per dokumen; header ada `{%logoMitra}` |
| `BAP` | BAP | BAP.docx | BAP | suggestName = No Sales Order |
| `BAST` | BAST | BAST.docx | BAST | Pihak pertama/kedua default `............`; perangkat & jumlah satu baris horizontal |
| `NODIN` | Nota Dinas | NODIN.docx | NODIN | `noSignature: true`; material 1–5 diloop via `{#items}` |

### Konvensi Tag DOCX
- `{namaField}` → teks biasa (docxtemplater)
- `{%ttd}`, `{%stempel}`, `{%logoMitra}` → gambar inline (docxtemplater-image-module-free)
- `{#items}…{/items}` → loop array (NODIN material list)
- Field `_namaField` (prefix `_`) → hanya UI, tidak masuk ke DOCX. Dipakai untuk date picker yang expand ke beberapa tag via `dateMaps`.

### Penamaan File Output
Format penamaan diambil dari nama file template original:  
`TEMPLATE_[NAMA FILE]_[FORMAT PENAMAAN].docx`  
Bagian `FORMAT PENAMAAN` jadi pola, dengan nilai field disubstitusi.  
Contoh: `TEMPLATE_BERITA ACARA KENDALA LAPANGAN_BAKL_NO PA.docx` → `BAKL_{noPA}`.

---

## Alur Simpan Dokumen

```
User isi form (EditorModal)
  → POST /api/documents
    → generateDoc(template, data)          # docxgen.ts
        → fillDocx()                       # render DOCX via docxtemplater
        → docxToPdf() (LibreOffice headless)
        → stampSignatures() (pdf-lib)      # tempel TTD/stempel di posisi drag
    → prepareTargetFolder()                # gdrive.ts — buat subfolder jika BA_PENGUJIAN
    → uploadFile() ×2 (PDF + DOCX)        # ke Drive folder
    → prisma.document.create()            # simpan metadata ke DB
      (gagal DB → deleteFile() cleanup Drive)
```

---

## Database (Prisma + PostgreSQL)

Model utama: `Document`
- `contentHtml: String` — kolom ini menyimpan **JSON form data** (bukan HTML)
- `logoBase64: String?` — logo mitra BA Pengujian sebagai data URL
- `driveFileIdPdf/Docx`, `webViewLinkPdf/Docx` — referensi file di Drive

`FolderType`: `SURAT_TUGAS | BERITA_ACARA`  
`TemplateType`: `SURAT_TUGAS | BA_PENGUJIAN | BAI | BAP | BAKL | UID_JABAR | BAST | NODIN`

---

## Komponen Kunci

### EditorModal.tsx
- Draft otosave ke `localStorage` key `iconform_draft_{templateId}` — dibaca saat modal buka (hanya dokumen baru, bukan edit)
- Clear draft setelah `onSaved()` berhasil
- Tutup dengan klik di luar modal atau tekan `Escape`
- TTD & stempel: upload gambar → normalize ke PNG via canvas → draggable di preview → posisi disimpan sebagai `ttdPos`/`stempelPos` (`{page},{x},{y}`)
- Logo mitra: upload ke state `logo` → dikirim ke API sebagai base64

### docxgen.ts
- `fillDocx()` — render DOCX template dengan docxtemplater. Gambar via ImageModule (blank 1×1 PNG jika tag kosong)
- `docxToPdf()` — LibreOffice headless (`soffice --headless --convert-to pdf`). Per-call HOME untuk isolasi profil LibreOffice (parallel-safe)
- `pdfToPngs()` — pdftoppm 96dpi untuk halaman preview
- `stampSignatures()` — pdf-lib untuk tempel TTD/stempel di posisi drag (LibreOffice drop floating anchors saat konversi)
- NODIN: field `material1..5` dirakit jadi array `items` sebelum render

### gdrive.ts
- OAuth2 user credentials (bukan service account)
- `resolveFolderId()` — cek env per template dulu, fallback per folder type
- `ensureFolder()` — find-or-create subfolder (race condition OK karena single-user)
- BA_PENGUJIAN: tiap dokumen dapat subfolder sendiri bernama filename; logo disimpan di situ

---

## Dependensi Sistem (di luar npm)

Harus tersedia di server/container:
- **LibreOffice** (`soffice`) — konversi DOCX → PDF
- **poppler-utils** (`pdftoppm`) — render PDF → PNG untuk preview

Lihat `Dockerfile` untuk cara install.

---

## Script Python (One-time)

Script di `scripts/` hanya dijalankan sekali untuk memodifikasi master DOCX. Tidak perlu dijalankan lagi kecuali ada perubahan template.

| Script | Fungsi |
|---|---|
| `retag.py` | Ganti dots placeholder dengan `{tag}` di 8 master |
| `retag2.py` | Cleanup literal & dots yang lolos retag.py (5 titik di BAI, UID_JABAR, BAST) |
| `revisi1.py` | Restruktur tabel NODIN & BAST |
| `add-ttd-tags.py` | Sisipkan `{%ttd}`/`{%stempel}` ke master |
| `tag-bast-nodin.py` | Tag khusus BAST & NODIN |

---

## Hal yang Perlu Diperhatikan

1. **Jangan gunakan `GDRIVE_SERVICE_ACCOUNT_B64`** — file credential lama, tidak valid, tidak ada storage quota di akun Google personal.
2. **`contentHtml` menyimpan JSON**, bukan HTML — nama kolom menyesatkan tapi tidak bisa diubah tanpa migration.
3. **Master DOCX** di `templates/docx/` adalah sumber kebenaran. Jangan ganti dengan versi dari GDocs tanpa melalui script tagging ulang.
4. **BAHP (BA_PENGUJIAN)** punya logo mitra di header kiri — tag `{%logoMitra}` di paragraf pertama header. Logo diupload via modal dan disimpan ke subfolder Drive.
5. **Field dengan prefix `_`** (misal `_tglPelaksanaan`) tidak masuk ke DOCX; hanya sebagai input UI yang di-expand via `dateMaps`.
6. **NODIN** tidak punya TTD/stempel (`noSignature: true`) dan punya loop material 1–5.
7. Draft localStorage tidak dibuat untuk dokumen yang sedang diedit (hanya new doc).

---

## Struktur URL

| URL | Keterangan |
|---|---|
| `/` | Dashboard (redirect ke login jika belum auth) |
| `/login` | Halaman login |
| `/api/documents` | GET list, POST create |
| `/api/documents/[id]` | PUT update, DELETE delete |
| `/api/documents/preview` | POST render preview (returns `{pages: string[]}`) |
| `/api/documents/[id]/download` | GET stream file dari Drive |

---

## Commit History Penting

```
1605c63  revisi kecil (EditorModal draft cache, click-outside, Escape close)
a0e197b  fix: BAP alignment, BAST layout, BAST/BAKL pihak defaults
12c9434  feat: BAHP header logo mitra + suggestName sesuai template filename
cc8188b  fix: retag2 — bersihkan sisa dots/literal di BAI, UID_JABAR, BAST
e6eb8f2  feat: retag — replace semua 8 master DOCX dengan original + {tag}
423f260  feat: revisi 1 — name tags, NODIN loop, BAKL year fix, logo wiring
5603d1d  feat: TTD + stempel uploadable + embedded di semua template
```
