-- Backfill: tanggal arsip dokumen lama = tanggal suratnya.
--
-- Sebelum perubahan ini, Document.createdAt memakai @default(now()) alias waktu
-- file di-generate. Form data tiap dokumen tersimpan sebagai JSON di kolom
-- contentHtml, jadi tanggal aslinya bisa dibaca langsung dari situ.
--
-- Peta template->field di bawah harus sama dengan `dateField` di
-- src/lib/templates.ts. Digandakan di sini karena ini script sekali jalan.
--
-- Cara pakai (ambil dump dulu):
--   docker compose exec iconform-db pg_dump -U postgres iconform > backup.sql
--   docker compose exec -T iconform-db psql -U postgres -d iconform < scripts/backfill-archive-date.sql
--
-- Idempoten: dokumen yang tanggalnya sudah benar tidak ikut ter-update, dan
-- dokumen tanpa tanggal valid tidak disentuh sama sekali.

\set ON_ERROR_STOP on

CREATE TEMP VIEW backfill_src AS
SELECT id,
       filename,
       "createdAt",
       CASE template
         WHEN 'SURAT_TUGAS'  THEN "contentHtml"::jsonb ->> '_tglSurat'
         WHEN 'BAI'          THEN "contentHtml"::jsonb ->> '_tglPelaksanaan'
         WHEN 'UID_JABAR'    THEN "contentHtml"::jsonb ->> '_tglPelaksanaan'
         WHEN 'BA_PENGUJIAN' THEN "contentHtml"::jsonb ->> '_tglPelaksanaan'
         WHEN 'BAKL'         THEN "contentHtml"::jsonb ->> '_tglBA'
         WHEN 'BAP'          THEN "contentHtml"::jsonb ->> '_tglBA'
         WHEN 'BAST'         THEN "contentHtml"::jsonb ->> '_tglSerahTerima'
       END AS iso
FROM "Document"
WHERE "contentHtml" LIKE '{%'                            -- lewati baris non-JSON
  AND jsonb_typeof("contentHtml"::jsonb) = 'object';

-- 1. Pratinjau: apa yang akan berubah.
SELECT id, filename, "createdAt" AS sekarang, iso::timestamp AS jadi
FROM backfill_src
WHERE iso ~ '^\d{4}-\d{2}-\d{2}$'
  AND iso::timestamp IS DISTINCT FROM "createdAt"
ORDER BY "createdAt" DESC;

-- 2. Dokumen yang dilewati (tanggal kosong / tidak valid) — biar ketahuan.
SELECT id, filename, "createdAt", COALESCE(iso, '(kosong)') AS iso
FROM backfill_src
WHERE iso IS NULL OR iso !~ '^\d{4}-\d{2}-\d{2}$'
ORDER BY "createdAt" DESC;

-- 3. Eksekusi. ::timestamp cocok dengan kolom Prisma timestamp(3) tanpa zona
--    waktu, dan menghasilkan instant yang sama dengan 'T00:00:00Z' di TypeScript.
UPDATE "Document" d
SET "createdAt" = src.iso::timestamp
FROM backfill_src src
WHERE d.id = src.id
  AND src.iso ~ '^\d{4}-\d{2}-\d{2}$'
  AND src.iso::timestamp IS DISTINCT FROM d."createdAt";
