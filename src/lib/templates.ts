import { type TemplateType, type FolderType } from '@prisma/client';

export type TemplateDef = {
  id: TemplateType;
  label: string;
  description: string;
  folder: FolderType;
  allowLogo: boolean;
  html: string;
  suggestName: (root: HTMLElement) => string | null;
};

function fieldText(root: HTMLElement, name: string): string {
  const el = root.querySelector<HTMLElement>(`[data-field="${name}"]`);
  return el?.innerText?.trim() ?? el?.textContent?.trim() ?? '';
}

function isPlaceholder(v: string): boolean {
  return !v || v.startsWith('[');
}

const today = () => {
  const d = new Date();
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const HEADER_BLOCK = `
  <div style="text-align:center; font-family:'Times New Roman',serif; border-bottom: 3px solid #000; padding-bottom: 8px; margin-bottom: 16px;">
    <div style="font-weight:bold; font-size:14pt;">PLN ICON PLUS</div>
    <div style="font-size:11pt;">Regional Jawa Barat</div>
    <div style="font-size:10pt;">Jl. Soekarno-Hatta No.436, Bandung 40235</div>
  </div>
`.trim();

export const TEMPLATES: TemplateDef[] = [
  {
    id: 'SURAT_TUGAS',
    label: 'Surat Tugas',
    description: 'Surat penugasan staf PLN Icon Plus',
    folder: 'SURAT_TUGAS',
    allowLogo: false,
    html: `
<div style="font-family:'Times New Roman',serif; font-size:12pt; color:#000; line-height:1.6;">
  ${HEADER_BLOCK}
  <div style="text-align:center; margin-bottom:16px;">
    <div style="font-weight:bold; text-decoration:underline; font-size:13pt;">SURAT TUGAS</div>
    <div>Nomor: <span data-field="nomor" class="bg-amber-100 px-1 rounded font-bold">[Nomor Surat]</span></div>
  </div>
  <p>Yang bertanda tangan di bawah ini, Pimpinan PLN Icon Plus Regional Jawa Barat, dengan ini menugaskan kepada:</p>
  <table style="margin-left:32px; margin-bottom:12px; line-height:2;">
    <tr><td style="width:160px;">Nama</td><td>:</td><td><span data-field="namaPenerima" class="bg-amber-100 px-1 rounded font-bold">[Nama Staf Penerima Tugas]</span></td></tr>
    <tr><td>Jabatan</td><td>:</td><td><span data-field="jabatan" class="bg-amber-100 px-1 rounded font-bold">[Jabatan]</span></td></tr>
    <tr><td>Unit</td><td>:</td><td><span data-field="unit" class="bg-amber-100 px-1 rounded font-bold">[Unit/Bagian]</span></td></tr>
  </table>
  <p>Untuk melaksanakan tugas: <span data-field="tugasPokok" class="bg-amber-100 px-1 rounded font-bold">[Uraian Tugas]</span></p>
  <p>Pada tanggal: <span data-field="tanggalTugas" class="bg-amber-100 px-1 rounded font-bold">[Tanggal Pelaksanaan]</span></p>
  <p>Di: <span data-field="lokasi" class="bg-amber-100 px-1 rounded font-bold">[Lokasi Pelaksanaan]</span></p>
  <p>Demikian surat tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.</p>
  <div style="margin-top:32px; text-align:right;">
    <div>Bandung, ${today()}</div>
    <div>Pimpinan Regional Jawa Barat</div>
    <div style="margin-top:64px;"><span data-field="namaPenandatangan" class="bg-amber-100 px-1 rounded font-bold">[Nama Penandatangan]</span></div>
    <div>NIP: <span data-field="nipPenandatangan" class="bg-amber-100 px-1 rounded font-bold">[NIP]</span></div>
  </div>
</div>`,
    suggestName: (root) => {
      const v = fieldText(root, 'namaPenerima');
      if (isPlaceholder(v)) return null;
      return 'Surat_Tugas_' + v.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').replace(/_+/g, '_');
    },
  },

  {
    id: 'BA_PENGUJIAN',
    label: 'BA Pengujian',
    description: 'Berita Acara Hasil Pengujian',
    folder: 'BERITA_ACARA',
    allowLogo: true,
    html: `
<div style="font-family:'Times New Roman',serif; font-size:12pt; color:#000; line-height:1.6;">
  ${HEADER_BLOCK}
  <div style="text-align:center; margin-bottom:16px;">
    <div style="font-weight:bold; text-decoration:underline; font-size:13pt;">BERITA ACARA HASIL PENGUJIAN</div>
    <div>Nomor: <span data-field="nomor" class="bg-amber-100 px-1 rounded font-bold">[Nomor BA]</span></div>
  </div>
  <p>Pada hari ini, <span data-field="hariTanggal" class="bg-amber-100 px-1 rounded font-bold">[Hari dan Tanggal]</span>, telah dilaksanakan pengujian terhadap:</p>
  <table style="margin-left:32px; margin-bottom:12px; line-height:2;">
    <tr><td style="width:200px;">Nama Perusahaan</td><td>:</td><td><span data-field="namaPerusahaan" class="bg-amber-100 px-1 rounded font-bold">[Nama Perusahaan Mitra]</span></td></tr>
    <tr><td>Jenis Pekerjaan</td><td>:</td><td><span data-field="jenisPekerjaan" class="bg-amber-100 px-1 rounded font-bold">[Jenis Pekerjaan]</span></td></tr>
    <tr><td>Lokasi Pengujian</td><td>:</td><td><span data-field="lokasiPengujian" class="bg-amber-100 px-1 rounded font-bold">[Lokasi]</span></td></tr>
  </table>
  <p>Hasil pengujian menyatakan bahwa pekerjaan tersebut <span data-field="hasilPengujian" class="bg-amber-100 px-1 rounded font-bold">[LULUS/TIDAK LULUS]</span> dengan keterangan:</p>
  <p><span data-field="keterangan" class="bg-amber-100 px-1 rounded font-bold">[Keterangan Hasil Pengujian]</span></p>
  <p>Demikian berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
  <div style="margin-top:32px; display:flex; justify-content:space-between;">
    <div style="text-align:center;">
      <div>Pihak Perusahaan</div>
      <div style="margin-top:64px;"><span data-field="namaMitra" class="bg-amber-100 px-1 rounded font-bold">[Nama Mitra]</span></div>
    </div>
    <div style="text-align:center;">
      <div>PLN Icon Plus Regional Jawa Barat</div>
      <div style="margin-top:64px;"><span data-field="namaPetugas" class="bg-amber-100 px-1 rounded font-bold">[Nama Petugas]</span></div>
    </div>
  </div>
</div>`,
    suggestName: (root) => {
      const v = fieldText(root, 'namaPerusahaan');
      if (isPlaceholder(v)) return null;
      return 'Berita Acara Hasil Pengujian_' + v;
    },
  },

  {
    id: 'BAI',
    label: 'BAI',
    description: 'Berita Acara Instalasi',
    folder: 'BERITA_ACARA',
    allowLogo: true,
    html: `
<div style="font-family:'Times New Roman',serif; font-size:12pt; color:#000; line-height:1.6;">
  ${HEADER_BLOCK}
  <div style="text-align:center; margin-bottom:16px;">
    <div style="font-weight:bold; text-decoration:underline; font-size:13pt;">BERITA ACARA INSTALASI</div>
  </div>
  <p>Pada hari ini telah dilakukan instalasi perangkat dengan nomor seri: <span data-field="nomorSeri" class="bg-amber-100 px-1 rounded font-bold">[Nomor Seri Perangkat]</span></p>
  <table style="margin-left:32px; margin-bottom:12px; line-height:2;">
    <tr><td style="width:200px;">Nama Perangkat</td><td>:</td><td><span data-field="namaPerangkat" class="bg-amber-100 px-1 rounded font-bold">[Nama Perangkat]</span></td></tr>
    <tr><td>Lokasi Instalasi</td><td>:</td><td><span data-field="lokasiInstalasi" class="bg-amber-100 px-1 rounded font-bold">[Lokasi Instalasi]</span></td></tr>
    <tr><td>Tanggal Instalasi</td><td>:</td><td><span data-field="tanggalInstalasi" class="bg-amber-100 px-1 rounded font-bold">[Tanggal Instalasi]</span></td></tr>
    <tr><td>Nama Pelaksana</td><td>:</td><td><span data-field="namaPelaksana" class="bg-amber-100 px-1 rounded font-bold">[Nama Pelaksana Instalasi]</span></td></tr>
  </table>
  <p>Instalasi telah selesai dilaksanakan dan perangkat berfungsi dengan baik.</p>
  <div style="margin-top:32px; text-align:right;">
    <div>Bandung, ${today()}</div>
    <div style="margin-top:64px;"><span data-field="namaPenandatangan" class="bg-amber-100 px-1 rounded font-bold">[Nama Penandatangan]</span></div>
  </div>
</div>`,
    suggestName: (root) => {
      const v = fieldText(root, 'nomorSeri');
      if (isPlaceholder(v)) return null;
      return 'BAI ' + v;
    },
  },

  {
    id: 'BAP',
    label: 'BAP',
    description: 'Berita Acara Penyelesaian',
    folder: 'BERITA_ACARA',
    allowLogo: true,
    html: `
<div style="font-family:'Times New Roman',serif; font-size:12pt; color:#000; line-height:1.6;">
  ${HEADER_BLOCK}
  <div style="text-align:center; margin-bottom:16px;">
    <div style="font-weight:bold; text-decoration:underline; font-size:13pt;">BERITA ACARA PENYELESAIAN</div>
  </div>
  <p>Pada hari ini telah selesai dilaksanakan pekerjaan berdasarkan:</p>
  <table style="margin-left:32px; margin-bottom:12px; line-height:2;">
    <tr><td style="width:200px;">No. Sales Order</td><td>:</td><td><span data-field="noSalesOrder" class="bg-amber-100 px-1 rounded font-bold">[No Sales Order]</span></td></tr>
    <tr><td>Nama Pekerjaan</td><td>:</td><td><span data-field="namaPekerjaan" class="bg-amber-100 px-1 rounded font-bold">[Nama Pekerjaan]</span></td></tr>
    <tr><td>Nama Pelanggan</td><td>:</td><td><span data-field="namaPelanggan" class="bg-amber-100 px-1 rounded font-bold">[Nama Pelanggan]</span></td></tr>
    <tr><td>Lokasi Pekerjaan</td><td>:</td><td><span data-field="lokasiPekerjaan" class="bg-amber-100 px-1 rounded font-bold">[Lokasi]</span></td></tr>
    <tr><td>Tanggal Selesai</td><td>:</td><td><span data-field="tanggalSelesai" class="bg-amber-100 px-1 rounded font-bold">[Tanggal Selesai]</span></td></tr>
  </table>
  <p>Pekerjaan telah diselesaikan sesuai dengan spesifikasi yang disepakati.</p>
  <div style="margin-top:32px; display:flex; justify-content:space-between;">
    <div style="text-align:center;">
      <div>Pelanggan</div>
      <div style="margin-top:64px;"><span data-field="namaPelangganTandaTangan" class="bg-amber-100 px-1 rounded font-bold">[Nama Pelanggan]</span></div>
    </div>
    <div style="text-align:center;">
      <div>PLN Icon Plus Regional Jawa Barat</div>
      <div style="margin-top:64px;"><span data-field="namaPetugas" class="bg-amber-100 px-1 rounded font-bold">[Nama Petugas]</span></div>
    </div>
  </div>
</div>`,
    suggestName: (root) => {
      const v = fieldText(root, 'noSalesOrder');
      if (isPlaceholder(v)) return null;
      return 'BAP_' + v;
    },
  },

  {
    id: 'BAKL',
    label: 'BAKL',
    description: 'Berita Acara Kelaikan',
    folder: 'BERITA_ACARA',
    allowLogo: true,
    html: `
<div style="font-family:'Times New Roman',serif; font-size:12pt; color:#000; line-height:1.6;">
  ${HEADER_BLOCK}
  <div style="text-align:center; margin-bottom:16px;">
    <div style="font-weight:bold; text-decoration:underline; font-size:13pt;">BERITA ACARA KELAIKAN</div>
    <div>Nomor: <span data-field="nomor" class="bg-amber-100 px-1 rounded font-bold">[Nomor BAKL]</span></div>
  </div>
  <p>Pada hari ini telah dilakukan pemeriksaan kelaikan terhadap instalasi milik:</p>
  <table style="margin-left:32px; margin-bottom:12px; line-height:2;">
    <tr><td style="width:200px;">Nama Perusahaan</td><td>:</td><td><span data-field="namaPerusahaan" class="bg-amber-100 px-1 rounded font-bold">[Nama Perusahaan]</span></td></tr>
    <tr><td>Alamat</td><td>:</td><td><span data-field="alamat" class="bg-amber-100 px-1 rounded font-bold">[Alamat]</span></td></tr>
    <tr><td>Jenis Instalasi</td><td>:</td><td><span data-field="jenisInstalasi" class="bg-amber-100 px-1 rounded font-bold">[Jenis Instalasi]</span></td></tr>
    <tr><td>Daya Tersambung</td><td>:</td><td><span data-field="dayaTersambung" class="bg-amber-100 px-1 rounded font-bold">[Daya Tersambung]</span></td></tr>
  </table>
  <p>Berdasarkan hasil pemeriksaan, instalasi tersebut dinyatakan <span data-field="statusKelaikan" class="bg-amber-100 px-1 rounded font-bold">[LAIK/TIDAK LAIK]</span> operasi.</p>
  <div style="margin-top:32px; text-align:right;">
    <div>Bandung, ${today()}</div>
    <div>Pemeriksa</div>
    <div style="margin-top:64px;"><span data-field="namaPemeriksa" class="bg-amber-100 px-1 rounded font-bold">[Nama Pemeriksa]</span></div>
  </div>
</div>`,
    suggestName: (root) => {
      const nomor = fieldText(root, 'nomor');
      const perusahaan = fieldText(root, 'namaPerusahaan');
      if (isPlaceholder(nomor) || isPlaceholder(perusahaan)) return null;
      return 'BAKL_' + nomor + '_' + perusahaan;
    },
  },

  {
    id: 'UID_JABAR',
    label: 'UID JABAR',
    description: 'Surat UID Jawa Barat',
    folder: 'BERITA_ACARA',
    allowLogo: true,
    html: `
<div style="font-family:'Times New Roman',serif; font-size:12pt; color:#000; line-height:1.6;">
  ${HEADER_BLOCK}
  <div style="text-align:center; margin-bottom:16px;">
    <div style="font-weight:bold; text-decoration:underline; font-size:13pt;">SURAT UID JAWA BARAT</div>
    <div>Nomor: <span data-field="nomor" class="bg-amber-100 px-1 rounded font-bold">[Nomor UID JABAR]</span></div>
  </div>
  <p>Sehubungan dengan pelaksanaan kegiatan di wilayah Jawa Barat, bersama ini kami sampaikan hal-hal sebagai berikut:</p>
  <table style="margin-left:32px; margin-bottom:12px; line-height:2;">
    <tr><td style="width:200px;">Perihal</td><td>:</td><td><span data-field="perihal" class="bg-amber-100 px-1 rounded font-bold">[Perihal Surat]</span></td></tr>
    <tr><td>Ditujukan Kepada</td><td>:</td><td><span data-field="tujuan" class="bg-amber-100 px-1 rounded font-bold">[Nama/Instansi Tujuan]</span></td></tr>
    <tr><td>Tanggal</td><td>:</td><td><span data-field="tanggalSurat" class="bg-amber-100 px-1 rounded font-bold">[Tanggal Surat]</span></td></tr>
  </table>
  <p><span data-field="isiSurat" class="bg-amber-100 px-1 rounded font-bold">[Isi Surat]</span></p>
  <p>Demikian disampaikan, atas perhatian dan kerjasamanya kami ucapkan terima kasih.</p>
  <div style="margin-top:32px; text-align:right;">
    <div>Bandung, ${today()}</div>
    <div>Pimpinan UID Jawa Barat</div>
    <div style="margin-top:64px;"><span data-field="namaPimpinan" class="bg-amber-100 px-1 rounded font-bold">[Nama Pimpinan]</span></div>
  </div>
</div>`,
    suggestName: (root) => {
      const v = fieldText(root, 'nomor');
      if (isPlaceholder(v)) return null;
      return 'UID JABAR ' + v;
    },
  },
];
