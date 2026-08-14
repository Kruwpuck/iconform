# Peta dokumentasi

Empat dokumen, masing-masing menjawab satu jenis pertanyaan. Mulai dari baris yang paling
cocok dengan keadaan Anda sekarang.

| Kalau Anda | Baca |
|---|---|
| baru menerima repo ini dan belum bisa menjalankannya | [setup.md](setup.md) |
| ingin tahu bagaimana sistemnya bekerja sebelum menyentuh kode | [architecture.md](architecture.md) |
| perlu memanggil endpoint HTTP-nya, atau ingin tahu galat apa yang bisa keluar | [api.md](api.md) |
| sudah menjalankannya dan perlu deploy, backup, atau mengubah master surat | [operations.md](operations.md) |
| menilai sisi keamanannya | [security-plan.md](security-plan.md) |

Gambaran singkat produknya ada di [README utama](../README.md).

---

## Isi tiap dokumen

**[setup.md](setup.md)** membawa Anda dari repo yang baru di-clone sampai surat pertama
tersimpan di Drive. Empat belas langkah berurutan, termasuk membuat project Google Cloud,
mengatur OAuth, menyiapkan folder Drive, dan mengisi setiap baris `.env`. Ada tabel
troubleshooting di bagian 13.

**[architecture.md](architecture.md)** menjelaskan susunan sistem: diagram konteks dan
container, aturan lapisan di dalam `src/`, model data, dan pipeline dokumen. Bagian
pipeline-nya yang paling penting dibaca sebelum menyentuh `docxgen.ts`, karena DOCX dan PDF
dihasilkan dari dua render berbeda dengan alasan yang tidak terlihat dari nama fungsinya.
Ditutup dengan daftar keanehan yang memang ada di kode sekarang.

**[api.md](api.md)** memerinci sepuluh endpoint: syarat autentikasi, parameter, bentuk body,
bentuk response, dan setiap kode galat beserta pesannya. Bagian awalnya memuat tiga hal
tentang hak akses yang biasanya disalahsangka pembaca.

**[operations.md](operations.md)** berisi subperintah skrip deploy, prosedur backup, cara
mengubah master DOCX beserta dua skrip pembenahan yang wajib dijalankan sesudahnya, dan
tabel kegagalan yang perlu dikenali. Bacalah bagian tentang seed yang menimpa password admin
setiap boot sebelum Anda bingung kenapa password admin kembali sendiri.

**[security-plan.md](security-plan.md)** adalah model ancaman dan daftar pengerasan yang
ditulis lebih awal dalam proyek. Sebagian isinya lebih tua daripada kode sekarang; bagian
yang sudah tidak berlaku ditandai di dokumennya.

---

## Arsip

`docs/archive/` menyimpan dokumen historis: rancangan awal, catatan handoff, dan dua putaran
umpan balik klien. Isinya sudah tidak akurat terhadap kode sekarang dan disimpan hanya untuk
melacak alasan sebuah keputusan diambil. Jangan dipakai sebagai panduan.

`docs/pics1/` dan `docs/pics2/` berisi tangkapan layar rujukan yang menjadi acuan dua
putaran umpan balik itu.
