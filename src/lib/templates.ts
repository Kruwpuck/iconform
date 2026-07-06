import { type TemplateType, type FolderType } from '@prisma/client';

export type TemplateField = {
  name: string;
  label: string;
  default?: string;
  multiline?: boolean;
};

export type TemplateDef = {
  id: TemplateType;
  label: string;
  description: string;
  folder: FolderType;
  /** DOCX master under templates/docx/ — the original GDocs file with {tags} */
  file: string;
  fields: TemplateField[];
  suggestName: (data: Record<string, string>) => string | null;
};

const clean = (v: string) => v.replace(/\//g, '-').replace(/\s+/g, '_');

/* shared field groups */
const HARI_TGL: TemplateField[] = [
  { name: 'hari', label: 'Hari' },
  { name: 'tanggal', label: 'Tanggal' },
  { name: 'bulan', label: 'Bulan' },
];

const BAI_FIELDS: TemplateField[] = [
  ...HARI_TGL,
  { name: 'tahun', label: 'Tahun (terbilang)', default: 'Dua Ribu Dua Puluh Enam' },
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
  { name: 'ttdPelanggan', label: 'Nama Penandatangan Pelanggan' },
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
      { name: 'tanggalTugas', label: 'Tanggal Tugas' },
      { name: 'lokasi', label: 'Lokasi' },
      { name: 'tanggalSurat', label: 'Tanggal Surat' },
    ],
    suggestName: (d) => (d.nomor ? 'Surat_Tugas_' + clean(d.nomor) : null),
  },
  {
    id: 'BAI',
    label: 'BAI (BAI-BAA)',
    description: 'Berita Acara Instalasi – Aktivasi',
    folder: 'BERITA_ACARA',
    file: 'BAI.docx',
    fields: BAI_FIELDS,
    suggestName: (d) => (d.noPA ? 'BAI_' + clean(d.noPA) : d.serviceId ? 'BAI_' + clean(d.serviceId) : null),
  },
  {
    id: 'UID_JABAR',
    label: 'BAI UID JABAR',
    description: 'BAI-BAA untuk PT PLN (Persero) Unit Induk Distribusi Jawa Barat',
    folder: 'BERITA_ACARA',
    file: 'BAI.docx', // same master; pelanggan pre-filled below
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
      ...HARI_TGL,
      { name: 'namaLayanan', label: 'Nama Layanan' },
      { name: 'noPA', label: 'No PA' },
      { name: 'wakilPihakPertama', label: 'PLN Icon Plus — Diwakili Oleh', default: 'Nadhif Ahmad Dhialdien' },
      { name: 'jabatanPihakPertama', label: 'PLN Icon Plus — Jabatan', default: 'Engineer Pembangunan SBU Regional Jabar' },
      { name: 'instansiPihakKedua', label: 'Pihak Kedua — Instansi' },
      { name: 'wakilPihakKedua', label: 'Pihak Kedua — Diwakili Oleh' },
      { name: 'jabatanPihakKedua', label: 'Pihak Kedua — Jabatan' },
      { name: 'alamatPihakKedua', label: 'Pihak Kedua — Alamat Kantor' },
      { name: 'telpPihakKedua', label: 'Pihak Kedua — Telepon & Fax' },
      { name: 'kendala1', label: 'Kendala 1', multiline: true },
      { name: 'kendala2', label: 'Kendala 2', multiline: true },
      { name: 'kendala3', label: 'Kendala 3', multiline: true },
      { name: 'lamaTertunda', label: 'Lama Tertunda (hari)' },
      { name: 'tglMulai', label: 'Tertunda Sejak Tanggal' },
      { name: 'tglSelesai', label: 'Tertunda Sampai Tanggal' },
      { name: 'kota', label: 'Kota', default: 'Bandung' },
      { name: 'tanggalBA', label: 'Tanggal Berita Acara' },
    ],
    suggestName: (d) => (d.noPA ? 'BAKL_' + clean(d.noPA) : null),
  },
  {
    id: 'BA_PENGUJIAN',
    label: 'BA Pengujian',
    description: 'Berita Acara Hasil Pengujian',
    folder: 'BERITA_ACARA',
    file: 'BA_PENGUJIAN.docx',
    fields: [
      ...HARI_TGL,
      { name: 'tahun', label: 'Tahun (terbilang + tanggal)', default: 'Dua Ribu Dua Puluh Enam' },
      { name: 'namaPihakPertama', label: 'Pihak Pertama — Nama' },
      { name: 'jabatanPihakPertama', label: 'Pihak Pertama — Jabatan' },
      { name: 'instansiPihakPertama', label: 'Pihak Pertama — Instansi' },
      { name: 'alamatPihakPertama', label: 'Pihak Pertama — Berkedudukan', multiline: true },
      { name: 'namaPihakKedua', label: 'Pihak Kedua (PLN Icon Plus) — Nama' },
      { name: 'jabatanPihakKedua', label: 'Pihak Kedua — Jabatan' },
    ],
    suggestName: (d) =>
      d.instansiPihakPertama ? 'BA_Pengujian_' + clean(d.instansiPihakPertama) : null,
  },
  {
    id: 'BAP',
    label: 'BAP',
    description: 'Berita Acara Pemakaian',
    folder: 'BERITA_ACARA',
    file: 'BAP.docx',
    fields: [
      { name: 'tanggal', label: 'Tanggal' },
      { name: 'bulan', label: 'Bulan' },
      { name: 'tahun', label: 'Tahun (terbilang)', default: 'Dua Ribu Dua Puluh Enam' },
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
      { name: 'ttdPelanggan', label: 'Nama Penandatangan Pelanggan' },
      { name: 'tanggalBA', label: 'Tanggal Berita Acara' },
    ],
    suggestName: (d) => (d.noSalesOrder ? 'BAP_' + clean(d.noSalesOrder) : null),
  },
];

export function templateById(id: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
