# PDL FORM

Sistem pembuatan dan pengarsipan surat untuk **PLN Icon Plus SBU Regional Jawa Barat**.
Petugas mengisi formulir di web, sistem mengisi master DOCX resmi, mengonversinya ke PDF,
menempelkan tanda tangan dan stempel hasil unggahan, lalu mengarsipkan kedua berkas ke
Google Drive sambil mencatat metadatanya di Postgres.

## Yang bisa dilakukan sistem ini

- Membuat surat dari tujuh master resmi dengan mengisi formulir, tanpa menyentuh Word.
- Menghasilkan dua berkas sekaligus per surat, satu PDF siap edar dan satu DOCX yang masih
  bisa disunting.
- Menempatkan tanda tangan, stempel, dan logo mitra dengan menggeser dan mengubah ukurannya
  langsung di atas pratinjau halaman.
- Mengarsipkan berkasnya ke folder Google Drive yang berbeda sesuai jenis suratnya, otomatis.
- Menyarankan nomor surat dari satu spreadsheet, dan menyarankan nama berkas dari isi
  formulir.
- Menelusuri arsip lewat pencarian nama, penyaringan jenis surat, dan riwayat per bulan yang
  mengikuti tanggal surat, bukan tanggal pembuatannya.
- Mengunduh ulang PDF atau DOCX kapan saja. Berkasnya dihasilkan ulang dari data formulir,
  sehingga perbaikan pada master ikut sampai ke surat lama.
- Mencatat siapa membuat, mengubah, dan menghapus apa di log aktivitas.
- Mengelola akun petugas: admin membuat akun, sistem memberi password sekali pakai, pemegang
  akun wajib menggantinya saat login pertama.

## Jenis surat

Tujuh master di `templates/docx/`.

| Jenis | Berkas master | Folder arsip |
|---|---|---|
| Surat Tugas | `SURAT_TUGAS.docx` | Surat Tugas |
| BAI (BAI-BAA) | `BAI.docx` | Berita Acara |
| BAI UID JABAR | `UID_JABAR.docx` | Berita Acara |
| BAKL (Kendala Lapangan) | `BAKL.docx` | Berita Acara |
| BAP | `BAP.docx` | Berita Acara |
| BAST | `BAST.docx` | Berita Acara |
| BA Pengujian | `BA_PENGUJIAN.docx` | Berita Acara |

Ada berkas `NODIN.docx` di folder yang sama, tapi jenis surat itu tidak aktif dan tidak
muncul di antarmuka. Alasannya dijelaskan di [docs/architecture.md](docs/architecture.md).

## Menjalankan

```bash
cp .env.example .env      # lalu isi nilainya
docker compose up -d --build
```

Buka **http://localhost**, porta 80 lewat Caddy. Login memakai `ADMIN_USERNAME` dan
`ADMIN_PASSWORD` yang Anda isi di `.env`, lalu sistem meminta Anda menggantinya.

Perintah di atas hanya berjalan penuh kalau `.env` sudah terisi, terutama bagian Google
Drive. Tanpa itu aplikasi tetap menyala dan pratinjau tetap bekerja, tapi penyimpanan surat
gagal karena tidak ada folder tujuan. Langkah lengkapnya, mulai dari membuat project Google
Cloud sampai mendapatkan setiap nilai `.env`, ada di **[docs/setup.md](docs/setup.md)**.

## Dokumentasi

| Dokumen | Isi |
|---|---|
| **[docs/setup.md](docs/setup.md)** | pemasangan dari nol: Google Cloud, OAuth, folder Drive, tiap baris `.env`, sampai surat pertama tersimpan |
| **[docs/architecture.md](docs/architecture.md)** | susunan sistem, aturan lapisan, model data, dan pipeline DOCX ke PDF |
| **[docs/api.md](docs/api.md)** | sepuluh endpoint HTTP beserta auth, body, response, dan semua kode galatnya |
| **[docs/operations.md](docs/operations.md)** | deploy, backup, mengubah master DOCX, dan kegagalan yang perlu dikenali |
| **[docs/security-plan.md](docs/security-plan.md)** | model ancaman dan daftar pengerasan |

Peta lengkapnya di [docs/README.md](docs/README.md).

## Tumpukan teknologi

Next.js 15 App Router, React 19, TypeScript, Prisma dan PostgreSQL, NextAuth v5, Tailwind
CSS. Pembuatan dokumen memakai docxtemplater untuk mengisi master DOCX, LibreOffice headless
untuk mengonversinya ke PDF, pdf-lib untuk menempelkan tanda tangan, dan poppler-utils untuk
membuat pratinjau. Semuanya berjalan di satu image Docker bersama Postgres dan Caddy.

## Test

```bash
npm test
```

Menguji logika murni di `src/domain/templates.ts`: penamaan berkas otomatis dan penerjemahan
tanggal ke bentuk kata.
