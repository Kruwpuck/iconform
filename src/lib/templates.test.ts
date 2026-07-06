import { TEMPLATES, templateById } from './templates';

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

const ST = templateById('SURAT_TUGAS')!;
const BAI = templateById('BAI')!;
const UID = templateById('UID_JABAR')!;
const BAKL = templateById('BAKL')!;
const PENG = templateById('BA_PENGUJIAN')!;
const BAP = templateById('BAP')!;

// SURAT_TUGAS — name from nomor
assert('ST empty→null', ST.suggestName({}), null);
assert('ST nomor', ST.suggestName({ nomor: '052101/STG/008/SUJBBICON+/2026' }), 'Surat_Tugas_052101-STG-008-SUJBBICON+-2026');

// BAI — noPA preferred, serviceId fallback
assert('BAI empty→null', BAI.suggestName({}), null);
assert('BAI noPA', BAI.suggestName({ noPA: 'A121303002621' }), 'BAI_A121303002621');
assert('BAI serviceId fallback', BAI.suggestName({ serviceId: '121601001669' }), 'BAI_121601001669');

// UID_JABAR
assert('UID empty→null', UID.suggestName({}), null);
assert('UID noPA', UID.suggestName({ noPA: 'A121601002171' }), 'BAI_UID_JABAR_A121601002171');
assert('UID pelanggan default set', UID.fields.find((f) => f.name === 'namaPelanggan')?.default ?? null, 'PT. PLN (PERSERO) UNIT INDUK DISTRIBUSI JAWA BARAT');

// BAKL
assert('BAKL empty→null', BAKL.suggestName({}), null);
assert('BAKL noPA', BAKL.suggestName({ noPA: 'A311601001953' }), 'BAKL_A311601001953');

// BA_PENGUJIAN
assert('Pengujian empty→null', PENG.suggestName({}), null);
assert('Pengujian instansi', PENG.suggestName({ instansiPihakPertama: 'PT Gatra Hita Wasana' }), 'BA_Pengujian_PT_Gatra_Hita_Wasana');

// BAP
assert('BAP empty→null', BAP.suggestName({}), null);
assert('BAP noSalesOrder', BAP.suggestName({ noSalesOrder: 'A121201000003' }), 'BAP_A121201000003');

// every template must point at an existing field set + docx file name
for (const t of TEMPLATES) {
  assert(`${t.id} has fields`, t.fields.length > 0 ? 'ok' : 'empty', 'ok');
  assert(`${t.id} file ends .docx`, t.file.endsWith('.docx') ? 'ok' : t.file, 'ok');
}

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
