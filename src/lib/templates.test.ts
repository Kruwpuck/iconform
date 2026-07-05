import { parseHTML } from 'linkedom';
import { TEMPLATES } from './templates';

function mockDOM(fieldMap: Record<string, string>): HTMLElement {
  const spans = Object.entries(fieldMap)
    .map(([k, v]) => `<span data-field="${k}">${v}</span>`)
    .join('');
  const { document } = parseHTML(`<div>${spans}</div>`);
  return document.querySelector('div') as unknown as HTMLElement;
}

let passed = 0;
let failed = 0;

function assert(label: string, actual: string | null, expected: string | null) {
  if (actual === expected) {
    console.log('✓', label);
    passed++;
  } else {
    console.error('✗', label, '| got:', JSON.stringify(actual), '| expected:', JSON.stringify(expected));
    failed++;
  }
}

const ST = TEMPLATES.find((t) => t.id === 'SURAT_TUGAS')!;
const BAP_T = TEMPLATES.find((t) => t.id === 'BA_PENGUJIAN')!;
const BAI_T = TEMPLATES.find((t) => t.id === 'BAI')!;
const BAP = TEMPLATES.find((t) => t.id === 'BAP')!;
const BAKL = TEMPLATES.find((t) => t.id === 'BAKL')!;
const UID = TEMPLATES.find((t) => t.id === 'UID_JABAR')!;

// SURAT_TUGAS
assert('ST placeholder→null', ST.suggestName(mockDOM({ namaPenerima: '[Nama Staf Penerima Tugas]' })), null);
assert('ST real name', ST.suggestName(mockDOM({ namaPenerima: 'Ahmad Fauzi' })), 'Surat_Tugas_Ahmad_Fauzi');
assert('ST special chars', ST.suggestName(mockDOM({ namaPenerima: 'Ahmad & Fauzi' })), 'Surat_Tugas_Ahmad_Fauzi');
assert('ST spaces→underscore', ST.suggestName(mockDOM({ namaPenerima: 'Budi Santoso' })), 'Surat_Tugas_Budi_Santoso');

// BA_PENGUJIAN
assert('BA Pengujian placeholder→null', BAP_T.suggestName(mockDOM({ namaPerusahaan: '[Nama Perusahaan Mitra]' })), null);
assert('BA Pengujian real', BAP_T.suggestName(mockDOM({ namaPerusahaan: 'PT. Maju Bersama' })), 'Berita Acara Hasil Pengujian_PT. Maju Bersama');

// BAI
assert('BAI placeholder→null', BAI_T.suggestName(mockDOM({ nomorSeri: '[Nomor Seri Perangkat]' })), null);
assert('BAI real', BAI_T.suggestName(mockDOM({ nomorSeri: 'A121303002XYZ' })), 'BAI A121303002XYZ');

// BAP
assert('BAP placeholder→null', BAP.suggestName(mockDOM({ noSalesOrder: '[No Sales Order]' })), null);
assert('BAP real', BAP.suggestName(mockDOM({ noSalesOrder: 'SO-2024-0042' })), 'BAP_SO-2024-0042');

// BAKL
assert('BAKL both placeholder→null', BAKL.suggestName(mockDOM({ nomor: '[Nomor BAKL]', namaPerusahaan: '[Nama Perusahaan]' })), null);
assert('BAKL nomor ok company placeholder→null', BAKL.suggestName(mockDOM({ nomor: 'A311601001953', namaPerusahaan: '[Nama Perusahaan]' })), null);
assert('BAKL both real', BAKL.suggestName(mockDOM({ nomor: 'A311601001953', namaPerusahaan: 'MSR' })), 'BAKL_A311601001953_MSR');

// UID_JABAR
assert('UID placeholder→null', UID.suggestName(mockDOM({ nomor: '[Nomor UID JABAR]' })), null);
assert('UID real', UID.suggestName(mockDOM({ nomor: 'A121610ABC' })), 'UID JABAR A121610ABC');

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
