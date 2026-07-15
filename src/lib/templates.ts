import { type TemplateType, type FolderType } from '@prisma/client';

/** how a date input value expands into document tags */
export type DateKind = 'weekday' | 'day' | 'month' | 'yearWords' | 'yearWordsDMY' | 'long' | 'year';

export type TemplateField = {
  name: string;
  label: string;
  default?: string;
  multiline?: boolean;
  type?: 'text' | 'date';
  /** for type:'date' — tag name → format written into data */
  dateMaps?: Record<string, DateKind>;
};

export type TemplateDef = {
  id: TemplateType;
  label: string;
  description: string;
  folder: FolderType;
  /** DOCX master under templates/docx/ — the original GDocs file with {tags} */
  file: string;
  /** BA Pengujian: partner logo upload, stored beside the document in Drive */
  allowLogo?: boolean;
  /** NODIN: no signature area, hide TTD/stempel uploads */
  noSignature?: boolean;
  fields: TemplateField[];
  suggestName: (data: Record<string, string>) => string | null;
};

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const UNITS = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan'];
const TEENS = ['Sepuluh', 'Sebelas', 'Dua Belas', 'Tiga Belas', 'Empat Belas', 'Lima Belas', 'Enam Belas', 'Tujuh Belas', 'Delapan Belas', 'Sembilan Belas'];

/** Indonesian words for years 2000–2099, e.g. 2026 → "Dua Ribu Dua Puluh Enam" */
function yearWords(y: number): string {
  const rest = y - 2000;
  if (rest === 0) return 'Dua Ribu';
  if (rest < 10) return 'Dua Ribu ' + UNITS[rest];
  if (rest < 20) return 'Dua Ribu ' + TEENS[rest - 10];
  const tens = Math.floor(rest / 10), unit = rest % 10;
  return 'Dua Ribu ' + UNITS[tens] + ' Puluh' + (unit ? ' ' + UNITS[unit] : '');
}

export function formatDate(kind: DateKind, iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  switch (kind) {
    case 'weekday': return d.toLocaleDateString('id-ID', { weekday: 'long' });
    case 'day': return String(d.getDate());
    case 'month': return MONTHS[d.getMonth()];
    case 'yearWords': return yearWords(d.getFullYear());
    case 'yearWordsDMY': {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${yearWords(d.getFullYear())} (${dd}-${mm}-${d.getFullYear()})`;
    }
    case 'long': return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    case 'year': return String(d.getFullYear());
  }
}

const clean = (v: string) => v.replace(/\//g, '-').replace(/\s+/g, '_');

const BAI_FIELDS: TemplateField[] = [
  { name: '_tglPelaksanaan', label: 'Tanggal Pelaksanaan', type: 'date', dateMaps: { hari: 'weekday', tanggal: 'day', bulan: 'month', tahun: 'yearWords' } },
  { name: 'namaLayanan', label: 'Nama Layanan' },
  { name: 'namaPelanggan', label: 'Nama Pelanggan' },
  { name: 'serviceId', label: 'Service ID' },
  { name: 'interface', label: 'Interface' },
  { name: 'bandwidth', label: 'Bandwidth' },
  { name: 'originating', label: 'Originating', multiline: true },
  { name: 'terminating', label: 'Terminating', multiline: true },
  { name: 'noPA', label: 'No PA' },
  { name: 'namaPerangkat', label: 'Nama Perangkat' },
  { name: 'snPerangkat', label: 'SN Perangkat' },
  { name: 'alamatPOP', label: 'Alamat/Lokasi POP' },
  { name: 'koordinatPOP', label: 'Koordinat POP' },
  { name: 'namaPerangkatPOP', label: 'Nama Perangkat POP' },
  { name: 'snPOP', label: 'SN Perangkat POP' },
  { name: 'kanalPort', label: 'Kanal/Port' },
  { name: 'jarakOTDR', label: 'Jarak OTDR' },
  { name: 'namaWakil', label: 'Wakil Pelanggan — Nama' },
  { name: 'jabatanWakil', label: 'Wakil Pelanggan — Jabatan' },
  { name: 'alamatKantor', label: 'Wakil Pelanggan — Alamat Kantor' },
  { name: 'kontakWakil', label: 'Wakil Pelanggan — Telp/HP, Email' },
  { name: 'instansiPelanggan', label: 'Instansi Penandatangan' },
  { name: 'namaProjectLeader', label: 'Nama Project Team Leader (PLN Icon Plus)' },
];

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'SURAT_TUGAS',
    label: 'Surat Tugas',
    description: 'Surat penugasan staf PLN Icon Plus SBU Regional Jawa Barat',
    folder: 'SURAT_TUGAS',
    file: 'SURAT_TUGAS.docx',
    fields: [
      { name: 'nomor', label: 'Nomor Surat' },
      { name: 'nama1', label: 'Nama Petugas 1' },
      { name: 'nama2', label: 'Nama Petugas 2' },
      { name: 'nama3', label: 'Nama Petugas 3' },
      { name: 'jabatanPenerima', label: 'Jabatan Petugas', default: 'Teknisi' },
      { name: 'uraianTugas', label: 'Uraian Tugas', multiline: true },
      { name: '_tglMulai', label: 'Tanggal Tugas — Mulai', type: 'date', dateMaps: { tanggalTugas: 'long' } },
      { name: '_tglSelesai', label: 'Tanggal Tugas — Selesai', type: 'date', dateMaps: { tanggalTugasSelesai: 'long' } },
      { name: 'lokasi', label: 'Lokasi' },
      { name: '_tglSurat', label: 'Tanggal Surat', type: 'date', dateMaps: { tanggalSurat: 'long' } },
      { name: 'namaPemberi', label: 'Pemberi Tugas — Nama' },
      { name: 'jabatanPemberi', label: 'Pemberi Tugas — Jabatan', default: 'Engineer Pembangunan dan Delivery Layanan' },
    ],
    suggestName: (d) => (d.nama1 ? clean(d.nama1) : null),
  },
  {
    id: 'BAI',
    label: 'BAI (BAI-BAA)',
    description: 'Berita Acara Instalasi – Aktivasi',
    folder: 'BERITA_ACARA',
    file: 'BAI.docx',
    fields: BAI_FIELDS,
    suggestName: (d) => (d.noPA ? 'Surat_BAI_' + clean(d.noPA) : d.serviceId ? 'Surat_BAI_' + clean(d.serviceId) : null),
  },
  {
    id: 'UID_JABAR',
    label: 'BAI UID JABAR',
    description: 'BAI-BAA untuk PT PLN (Persero) Unit Induk Distribusi Jawa Barat',
    folder: 'BERITA_ACARA',
    file: 'UID_JABAR.docx',
    fields: BAI_FIELDS.map((f) =>
      f.name === 'namaPelanggan' || f.name === 'instansiPelanggan'
        ? { ...f, default: 'PT. PLN (PERSERO) UNIT INDUK DISTRIBUSI JAWA BARAT' }
        : f
    ),
    suggestName: (d) => (d.noPA ? 'BAI_UID_JABAR_' + clean(d.noPA) : null),
  },
  {
    id: 'BAKL',
    label: 'BAKL',
    description: 'Berita Acara Kendala Lapangan',
    folder: 'BERITA_ACARA',
    file: 'BAKL.docx',
    fields: [
      { name: '_tglPelaksanaan', label: 'Tanggal Pelaksanaan', type: 'date', dateMaps: { hari: 'weekday', tanggal: 'day', bulan: 'month', tahun: 'year' } },
      { name: 'namaLayanan', label: 'Nama Layanan' },
      { name: 'noPA', label: 'No PA' },
      { name: 'wakilPihakPertama', label: 'PLN Icon Plus — Diwakili Oleh', default: '............' },
      { name: 'jabatanPihakPertama', label: 'PLN Icon Plus — Jabatan', default: '............' },
      { name: 'instansiPihakKedua', label: 'Pihak Kedua — Instansi', default: '............' },
      { name: 'wakilPihakKedua', label: 'Pihak Kedua — Diwakili Oleh', default: '............' },
      { name: 'jabatanPihakKedua', label: 'Pihak Kedua — Jabatan', default: '............' },
      { name: 'alamatPihakKedua', label: 'Pihak Kedua — Alamat Kantor', default: '............' },
      { name: 'telpPihakKedua', label: 'Pihak Kedua — Telepon & Fax', default: '............' },
      { name: 'kendala1', label: 'Kendala 1', multiline: true },
      { name: 'kendala2', label: 'Kendala 2', multiline: true },
      { name: 'kendala3', label: 'Kendala 3', multiline: true },
      { name: 'lamaTertunda', label: 'Lama Tertunda (hari)' },
      { name: '_tglTundaMulai', label: 'Tertunda — Mulai', type: 'date', dateMaps: { tglMulai: 'long' } },
      { name: '_tglTundaSelesai', label: 'Tertunda — Selesai', type: 'date', dateMaps: { tglSelesai: 'long' } },
      { name: 'kota', label: 'Kota', default: 'Bandung' },
      { name: '_tglBA', label: 'Tanggal Berita Acara', type: 'date', dateMaps: { tanggalBA: 'long' } },
    ],
    suggestName: (d) => (d.noPA ? 'BAKL_' + clean(d.noPA) : null),
  },
  {
    id: 'BA_PENGUJIAN',
    label: 'BA Pengujian',
    description: 'Berita Acara Hasil Pengujian',
    folder: 'BERITA_ACARA',
    file: 'BA_PENGUJIAN.docx',
    allowLogo: true,
    fields: [
      { name: 'nomor', label: 'Nomor Berita Acara' },
      { name: '_tglPelaksanaan', label: 'Tanggal Pelaksanaan', type: 'date', dateMaps: { hari: 'weekday', tanggal: 'day', bulan: 'month', tahun: 'yearWordsDMY' } },
      { name: 'namaPihakPertama', label: 'Pihak Pertama — Nama' },
      { name: 'jabatanPihakPertama', label: 'Pihak Pertama — Jabatan' },
      { name: 'instansiPihakPertama', label: 'Pihak Pertama — Instansi' },
      { name: 'alamatPihakPertama', label: 'Pihak Pertama — Berkedudukan', multiline: true },
      { name: 'namaPihakKedua', label: 'Pihak Kedua (PLN Icon Plus) — Nama' },
      { name: 'jabatanPihakKedua', label: 'Pihak Kedua — Jabatan' },
    ],
    suggestName: (d) =>
      d.instansiPihakPertama ? 'BAHP_' + clean(d.instansiPihakPertama)
      : d.nomor ? 'BAHP_' + clean(d.nomor)
      : null,
  },
  {
    id: 'BAP',
    label: 'BAP',
    description: 'Berita Acara Pemakaian',
    folder: 'BERITA_ACARA',
    file: 'BAP.docx',
    fields: [
      { name: '_tglPelaksanaan', label: 'Tanggal Pelaksanaan', type: 'date', dateMaps: { tanggal: 'day', bulan: 'month', tahun: 'yearWords' } },
      { name: 'namaLayanan', label: 'Nama Layanan' },
      { name: 'noSalesOrder', label: 'No Sales Order' },
      { name: 'namaPelanggan', label: 'Nama Pelanggan' },
      { name: 'alamatOri', label: 'Alamat/Lokasi Originating' },
      { name: 'perangkatOri', label: 'Perangkat & S/N Originating' },
      { name: 'kanalOri', label: 'Kanal/Port Originating' },
      { name: 'alamatTer', label: 'Alamat/Lokasi Terminating' },
      { name: 'perangkatTer', label: 'Perangkat & S/N Terminating' },
      { name: 'kanalTer', label: 'Kanal/Port Terminating' },
      { name: 'kegunaan', label: 'Kegunaan' },
      { name: 'statusOri', label: 'Status Integrasi Originating' },
      { name: 'catatanOri', label: 'Catatan Originating' },
      { name: 'statusTer', label: 'Status Integrasi Terminating' },
      { name: 'catatanTer', label: 'Catatan Terminating' },
      { name: 'jarakOTDR', label: 'Jarak OTDR' },
      { name: 'instansiPelanggan', label: 'Instansi Penandatangan' },
      { name: '_tglBA', label: 'Tanggal Berita Acara', type: 'date', dateMaps: { tanggalBA: 'long' } },
      { name: 'namaWakilPelanggan', label: 'Wakil Pelanggan — Nama (untuk TTD)' },
      { name: 'namaWakilIcon', label: 'Wakil PLN Icon Plus — Nama (untuk TTD)' },
    ],
    suggestName: (d) => (d.noSalesOrder ? 'BAP_' + clean(d.noSalesOrder) : null),
  },
  {
    id: 'BAST',
    label: 'BAST',
    description: 'Berita Acara Serah Terima Barang',
    folder: 'BERITA_ACARA',
    file: 'BAST.docx',
    fields: [
      { name: 'nomor', label: 'Nomor Berita Acara' },
      { name: '_tglSerahTerima', label: 'Tanggal Serah Terima', type: 'date', dateMaps: { hari: 'weekday', tanggal: 'day', bulan: 'month', tahun: 'yearWordsDMY' } },
      { name: 'namaPihakPertama', label: 'Pihak Pertama — Nama', default: '............' },
      { name: 'jabatanPihakPertama', label: 'Pihak Pertama — Jabatan', default: '............' },
      { name: 'instansiPihakPertama', label: 'Pihak Pertama — Instansi', default: '............' },
      { name: 'berkedudukanPihakPertama', label: 'Pihak Pertama — Berkedudukan', multiline: true, default: '............' },
      { name: 'namaPihakKedua', label: 'Pihak Kedua — Nama', default: '............' },
      { name: 'jabatanPihakKedua', label: 'Pihak Kedua — Jabatan', default: '............' },
      { name: 'instansiPihakKedua', label: 'Pihak Kedua — Instansi', default: '............' },
      { name: 'berkedudukanPihakKedua', label: 'Pihak Kedua — Berkedudukan', multiline: true, default: '............' },
      { name: 'perangkat', label: 'Perangkat' },
      { name: 'jumlah', label: 'Jumlah' },
      { name: 'biaya', label: 'Jenis Biaya (dasar penagihan)' },
    ],
    suggestName: (d) => (d.perangkat ? 'BAST_' + clean(d.perangkat) : null),
  },
  {
    id: 'NODIN',
    label: 'Nota Dinas',
    description: 'Nota Dinas permohonan pembayaran dana dropping',
    folder: 'BERITA_ACARA', // ponytail: reuse existing FolderType; Drive routing is per-template anyway
    file: 'NODIN.docx',
    noSignature: true,
    fields: [
      { name: 'perihal', label: 'Perihal' },
      { name: 'pekerjaan', label: 'Pekerjaan yang Telah Dilaksanakan' },
      { name: 'tim', label: 'Tim Pelaksana (dari)' },
      { name: 'prk', label: 'No PRK' },
      { name: 'coa', label: 'COA' },
      { name: 'miDana', label: 'MI Dana Dropping', default: 'MI Dana Dropping SBU Regional 030117/MI/008/PUSAT/ICON+/2017' },
      { name: 'miList', label: 'MI List Material', default: 'MI List Material Dropping No.' },
      { name: 'material1', label: 'Material 1' },
      { name: 'vol1', label: 'Volume 1' },
      { name: 'satuan1', label: 'Satuan 1' },
      { name: 'hargaSatuan1', label: 'Harga Satuan 1 (Rp)' },
      { name: 'jumlahTotal1', label: 'Jumlah Total 1 (Rp)' },
      { name: 'material2', label: 'Material 2 (opsional)' },
      { name: 'vol2', label: 'Volume 2' },
      { name: 'satuan2', label: 'Satuan 2' },
      { name: 'hargaSatuan2', label: 'Harga Satuan 2 (Rp)' },
      { name: 'jumlahTotal2', label: 'Jumlah Total 2 (Rp)' },
      { name: 'material3', label: 'Material 3 (opsional)' },
      { name: 'vol3', label: 'Volume 3' },
      { name: 'satuan3', label: 'Satuan 3' },
      { name: 'hargaSatuan3', label: 'Harga Satuan 3 (Rp)' },
      { name: 'jumlahTotal3', label: 'Jumlah Total 3 (Rp)' },
      { name: 'material4', label: 'Material 4 (opsional)' },
      { name: 'vol4', label: 'Volume 4' },
      { name: 'satuan4', label: 'Satuan 4' },
      { name: 'hargaSatuan4', label: 'Harga Satuan 4 (Rp)' },
      { name: 'jumlahTotal4', label: 'Jumlah Total 4 (Rp)' },
      { name: 'material5', label: 'Material 5 (opsional)' },
      { name: 'vol5', label: 'Volume 5' },
      { name: 'satuan5', label: 'Satuan 5' },
      { name: 'hargaSatuan5', label: 'Harga Satuan 5 (Rp)' },
      { name: 'jumlahTotal5', label: 'Jumlah Total 5 (Rp)' },
      { name: 'totalTagihan', label: 'Total Tagihan (Rp)' },
    ],
    suggestName: (d) =>
      d.perihal ? 'NODIN_' + clean(d.perihal).replace(/[^a-zA-Z0-9_-]/g, '') : null,
  },
];

export function templateById(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
