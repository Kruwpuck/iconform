# Operasional

Tugas rutin sesudah sistem berjalan: deploy, backup, memeriksa log, mengubah master DOCX,
dan menangani hal-hal yang bisa merusak diam-diam. Untuk pemasangan awal, baca
[setup.md](setup.md). Untuk memahami apa yang Anda sentuh, baca
[architecture.md](architecture.md).

---

## Skrip deploy

Semua operasi lewat satu skrip. Di server Ubuntu pakai `deploy.sh`, di Windows pakai
`deploy.ps1`. Keduanya menyediakan subperintah yang sama.

```bash
./deploy.sh <subperintah>          # Linux, macOS
.\deploy.ps1 <subperintah>         # Windows
```

| Subperintah | Yang dilakukan |
|---|---|
| `redeploy` (default) | `git pull --rebase origin main`, build ulang image aplikasi, `up -d`, tunggu sehat |
| `rebuild` | build ulang dan `up -d` tanpa `git pull` |
| `up` | jalankan container tanpa build ulang |
| `down` | matikan semua container |
| `logs` | ikuti 100 baris terakhir log aplikasi |
| `migrate` | terapkan `schema.prisma` ke database sekarang |
| `seed` | jalankan ulang skrip seed |
| `psql` | buka shell `psql` di database |
| `status` | tampilkan status container |

Menjalankan tanpa argumen sama dengan `redeploy`. Sesudah build, skrip menunggu sampai 120
detik untuk container aplikasi berstatus `Up`, lalu memperingatkan kalau belum.

Perubahan skema tidak perlu langkah terpisah. `redeploy` sudah menerapkannya, karena
perintah boot container menjalankan `prisma db push` lebih dulu. Subperintah `migrate`
hanya untuk kasus Anda ingin menerapkan skema tanpa membangun ulang.

---

## Peringatan: seed menimpa password admin setiap boot

Skrip seed berjalan setiap kali container aplikasi menyala, dan operasinya `upsert`. Setiap
restart menulis ulang hash password admin dari `ADMIN_PASSWORD` di `.env`.

Akibatnya yang perlu diingat:

- Password admin yang diganti lewat antarmuka **kembali ke nilai `.env`** pada restart
  berikutnya.
- Cara mengganti password admin yang bertahan: ubah `ADMIN_PASSWORD` di `.env`, lalu
  `docker compose restart iconform-app`.
- Kalau password admin hilang, cukup baca `.env`. Tidak ada prosedur pemulihan lain yang
  diperlukan.

Akun petugas tidak terpengaruh. Password mereka disimpan di database seperti biasa dan tidak
disentuh seed.

Konsekuensi keamanannya: siapa pun yang bisa membaca `.env` di server bisa masuk sebagai
admin. Jaga izin berkasnya, dan jangan menyalin `.env` ke tempat yang dicadangkan tanpa
enkripsi.

---

## Backup database

Database menyimpan indeks arsip: nama berkas, template, data formulir, dan id berkas Drive.
Isi suratnya sendiri ada di Drive. Kehilangan database berarti kehilangan indeksnya, bukan
kehilangan suratnya, tapi memulihkan indeks tanpa dump berarti menyusun ulang manual.

Ambil dump:

```bash
docker compose exec -T iconform-db pg_dump -U iconform iconform > backup-$(date +%F).sql
```

Pulihkan ke database yang kosong:

```bash
docker compose exec -T iconform-db psql -U iconform -d iconform < backup-2026-08-13.sql
```

Berkas `.sql` diabaikan `.gitignore` dengan sengaja, karena dump ini memuat data pelanggan
sungguhan: nama, alamat, nomor kontak, dan identitas layanan. Jangan pernah meng-commit
dump, dan jangan menaruhnya di folder yang tersinkron ke penyimpanan awan bersama.

Volume Docker `pgdata` menyimpan data Postgres. Volume itu bertahan melewati
`docker compose down`, tapi hilang kalau Anda menjalankan `down -v`. Perhatikan bendera
itu.

---

## Memeriksa log

```bash
docker compose logs --tail=100 iconform-app     # aplikasi
docker compose logs --tail=50 iconform-db       # database
docker compose logs --tail=50 caddy             # reverse proxy
./deploy.sh logs                                # ikuti log aplikasi
```

Log dibatasi 10 MB per berkas dengan tiga rotasi per service, jadi tidak akan menghabiskan
disk, tapi juga tidak menyimpan riwayat panjang. Kalau Anda perlu menyelidiki insiden lama,
ambil log-nya sebelum rotasinya menimpa.

Di dalam aplikasi ada log terpisah yang lebih berguna untuk pertanyaan operasional siapa
mengubah apa: halaman **Log Aktivitas** di sidebar, isinya 200 entri terakhir dari tabel
`AuditLog`. Entrinya menyimpan nama pelaku sebagai snapshot, jadi tetap terbaca setelah
akunnya dihapus.

---

## Mengubah master DOCX

Master surat ada di `templates/docx/`. Kalau Anda mengedit salah satunya di Word atau
LibreOffice, lakukan dua langkah pembenahan sesudahnya, lalu uji di Word.

```bash
python scripts/urutkan_ppr.py
python scripts/satukan_mark.py
```

Kedua skrip itu idempoten, jadi aman dijalankan ulang.

`urutkan_ppr.py` menyusun ulang anak elemen `<w:pPr>` mengikuti urutan yang diwajibkan
skema OOXML. Ini bukan kerapian: **Word menolak membuka berkas yang urutannya salah,
sementara LibreOffice tetap mau membukanya**. Karena PDF dihasilkan LibreOffice, cacat ini
lolos dari semua pengujian yang hanya melihat PDF, dan baru muncul saat pengguna membuka
DOCX-nya di Word.

`satukan_mark.py` menyatukan `{%ttd}` dan `{%stempel}` ke satu paragraf, supaya keduanya
digeser berurutan alih-alih saling menimpa.

Sesudah itu, uji dengan sungguh-sungguh membuka hasil generate-nya di Word, bukan hanya
melihat pratinjau PDF di aplikasi.

Folder `scripts/` berisi sekitar empat puluh skrip Python lain. Mayoritasnya operasi sekali
pakai dari putaran revisi klien: memasang tag ke master yang baru, memperbaiki indentasi
satu template, merapikan satu blok tanda tangan. Skrip-skrip itu bukan kode aplikasi dan
tidak perlu dijalankan lagi. Hanya dua yang di atas yang dimaksudkan untuk dipakai berulang.

Perlu diingat juga bahwa unduhan menghasilkan ulang berkas dari data formulir tersimpan,
bukan mengambil salinan Drive. Jadi memperbaiki master DOCX ikut memperbaiki unduhan
dokumen yang diarsipkan sebelum perbaikan itu ada. Salinan yang sudah ada di Drive tidak
berubah.

---

## Menambah atau mengubah kolom database

Repo ini tidak memakai berkas migration. Ubah `prisma/schema.prisma`, lalu terapkan:

```bash
./deploy.sh migrate      # atau cukup ./deploy.sh redeploy
```

Perintahnya `prisma db push --accept-data-loss`, sama seperti yang dijalankan container saat
boot. Bendera itu berarti kolom yang Anda hapus dari skema benar-benar di-drop beserta
isinya, tanpa konfirmasi. Ambil dump database dulu kalau perubahannya membuang kolom yang
mungkin masih berisi data yang Anda butuhkan.

Kalau nanti aplikasinya dijalankan lebih dari satu replika, pola ini harus diubah:
menerapkan skema saat boot berarti setiap replika mencoba mengubah skema bersamaan.

---

## Kegagalan yang perlu Anda kenali

| Gejala | Sebab | Tindakan |
|---|---|---|
| Container aplikasi restart berulang | seed gagal, biasanya `ADMIN_PASSWORD` kurang dari 12 karakter | perpanjang di `.env`, `docker compose up -d`. Perintah boot merantai `db push`, seed, dan server dengan `&&`, jadi seed yang gagal menghalangi server menyala |
| Semua penyimpanan gagal serentak, padahal sebelumnya lancar | refresh token Drive kedaluwarsa, terjadi sesudah sekitar tujuh hari kalau akunnya belum jadi test user di OAuth consent screen | tambahkan test user, ambil token baru, lihat [setup.md](setup.md) langkah 4 dan 6 |
| Simpan gagal dengan `Drive folder ID not configured` | tidak ada variabel folder yang cocok untuk jenis surat itu | isi variabelnya, lihat [setup.md](setup.md) langkah 7 |
| Autocomplete nomor surat kosong | `GDRIVE_SHEET_NOMOR_ID` salah, daftar bukan di kolom A tab pertama, akun tanpa akses, atau Sheets API belum aktif | uji dengan `curl http://localhost/api/nomor`. Endpoint ini menelan galat dan tetap menjawab 200, jadi tidak ada pesan yang menuntun |
| Ada folder Drive kembar bernama sama | dua penyimpanan bersamaan; pencarian folder tidak memakai lock | gabungkan manual di Drive. Untuk pemakaian satu petugas hal ini jarang terjadi |
| DOCX menolak dibuka di Word, PDF-nya normal | urutan `<w:pPr>` di master rusak sesudah diedit | jalankan `scripts/urutkan_ppr.py` |
| Login terkunci walaupun password benar | lima kegagalan berurutan mengunci username 15 menit | tunggu, atau `docker compose restart iconform-app` karena penghitungnya di memori proses |

---

## Memindahkan sistem ke akun Google atau server lain

Yang perlu dibawa: berkas `.env`, dump database, dan isi folder Drive.

Kalau akun Google-nya berubah, id folder Drive dan refresh token juga berubah, sedangkan
baris `Document` di database menyimpan id berkas Drive yang lama. Tautan arsip yang sudah
ada karena itu tetap menunjuk ke berkas di akun lama. Unduhan tetap bekerja karena berkasnya
dihasilkan ulang dari data formulir, tapi tombol yang membuka Drive akan mengarah ke tempat
yang salah.

Kalau hanya servernya yang berpindah dan akun Google-nya sama, cukup salin `.env`, pulihkan
dump, lalu `./deploy.sh redeploy`. Tidak ada state lain yang perlu dibawa: berkas dokumen
tidak pernah disimpan di disk server.
