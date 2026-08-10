"""BAST: jaga tabel tanda tangan tetap di halaman satu.

Dengan tiga baris perangkat, isi BAST berakhir di sekitar 74% halaman — masih
sisa ~217 pt di bawahnya — tapi tabel tanda tangan (tinggi render ~113 pt,
seluruh barisnya w:cantSplit) tetap pindah ke halaman dua. Halaman dua lalu
hanya berisi logo header yang berulang plus blok tanda tangan.

Dua hal yang memakan sisa ruang itu:

1. Dua paragraf kosong antara "Demikian Berita Acara ..." dan tabel (~24 pt).
   Baris pertama tabel sendiri sudah 200 twip plus margin sel, jadi jaraknya
   tetap ada tanpa paragraf kosong itu.
2. Baris {%ttd}/{%stempel} setinggi 1481 twip (74 pt). Mark inline hanya
   33,75 pt, jadi 1200 twip (60 pt) masih longgar.

Total ~38 pt kembali — cukup untuk kasus tiga perangkat. Dokumen yang isinya
memang lebih panjang dari satu halaman tetap akan menumpuk ke halaman dua;
itu sifat kertasnya, bukan bug.

Idempoten: jalan kedua kali tidak menemukan apa-apa.

    python scripts/rapikan_bast_halaman.py
"""
import copy
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'templates' / 'docx' / 'BAST.docx'
DOC = 'word/document.xml'

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
OLD_HEIGHT, NEW_HEIGHT = '1481', '1200'


def q(tag):
    return '{%s}%s' % (W, tag)


def text_of(el):
    return ''.join(t.text or '' for t in el.iter(q('t')))


def sign_table(body):
    """Tabel terakhir — barisnya memuat tag mark."""
    tables = [el for el in body if el.tag == q('tbl')]
    return next(t for t in reversed(tables) if '{%ttd}' in text_of(t))


def normalize_blanks_before(body, table):
    """Sisakan tepat satu paragraf kosong sebelum tabel.

    Nol paragraf membuat "PIHAK PERTAMA" menempel ke "sebagaimana mestinya.";
    dua membuat tabel jatuh ke halaman dua. Satu pas."""
    blanks = []
    kids = list(body)
    at = kids.index(table) - 1
    while at >= 0 and kids[at].tag == q('p') and not text_of(kids[at]).strip():
        blanks.append(kids[at])
        at -= 1
    if len(blanks) == 1:
        return 0
    for extra in blanks[:-1] if blanks else []:
        body.remove(extra)
    if not blanks:
        # bentuk paragraf kosong dari paragraf "Demikian ..." di atasnya, supaya
        # w:spacing-nya sama; run-nya dibuang, pPr-nya ikut
        model = [p for p in body if p.tag == q('p') and text_of(p).strip()][-1]
        spare = copy.deepcopy(model)
        for r in spare.findall(q('r')):
            spare.remove(r)
        body.insert(list(body).index(table), spare)
        return 1
    return -len(blanks[:-1])


def shrink_mark_row(table):
    for row in table.findall(q('tr')):
        if '{%ttd}' not in text_of(row):
            continue
        trPr = row.find(q('trPr'))
        h = None if trPr is None else trPr.find(q('trHeight'))
        if h is not None and h.get(q('val')) == OLD_HEIGHT:
            h.set(q('val'), NEW_HEIGHT)
            return True
    return False


def main():
    src = zipfile.ZipFile(TARGET)
    root = etree.fromstring(src.read(DOC))
    body = root.find(q('body'))

    table = sign_table(body)
    moved = normalize_blanks_before(body, table)
    shrunk = shrink_mark_row(table)
    if not moved and not shrunk:
        src.close()
        print('BAST.docx sudah rapi — tidak ada yang perlu diubah')
        return
    print('paragraf kosong sebelum tabel TTD: %+d (sisa 1); tinggi baris mark %s'
          % (moved, '%s -> %s' % (OLD_HEIGHT, NEW_HEIGHT) if shrunk else 'sudah pas'))

    doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    items = [(i, src.read(i.filename)) for i in src.infolist()]
    src.close()
    with zipfile.ZipFile(TARGET, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in items:
            out.writestr(info, doc if info.filename == DOC else data)
    print('tulis', TARGET.relative_to(ROOT))


if __name__ == '__main__':
    main()
