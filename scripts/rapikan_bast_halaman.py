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
   33,75 pt, jadi 900 twip (45 pt) sudah longgar — angka yang sama dipakai
   BAKL (scripts/rapikan_ttd.py:21). Sisa tingginya tetap jadi ruang tanda
   tangan basah kalau mark-nya tidak diunggah.
3. Tiap sel tanda tangan memuat dua paragraf: {%ttd} lalu {%stempel}, jadi
   mark-nya menumpuk vertikal. Begitu keduanya diunggah, tingginya 2 x 33,75 pt
   = 67,5 pt dan barisnya melar melewati 1200 twip — cukup untuk mendorong
   seluruh tabel ke halaman dua, padahal tanpa mark masih muat. Digabung jadi
   satu paragraf (tanda tangan lalu stempel bersebelahan): hemat 33,75 pt per
   kolom, dan di Word/Docs blok tanda tangan berhenti terpisah dari namanya.

Total ~72 pt kembali — cukup untuk kasus tiga perangkat dengan keempat mark
terunggah. Dokumen yang isinya memang lebih panjang dari satu halaman tetap
akan menumpuk ke halaman dua; itu sifat kertasnya, bukan bug.

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
NEW_HEIGHT = '900'


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
    """Tinggi baris mark -> NEW_HEIGHT. Kembalikan nilai lamanya, None kalau pas."""
    for row in table.findall(q('tr')):
        if '{%ttd}' not in text_of(row):
            continue
        trPr = row.find(q('trPr'))
        h = None if trPr is None else trPr.find(q('trHeight'))
        if h is not None and h.get(q('val')) != NEW_HEIGHT:
            was = h.get(q('val'))
            h.set(q('val'), NEW_HEIGHT)
            return was
    return None


def merge_mark_paragraphs(table):
    """Satu sel = satu paragraf mark: tanda tangan lalu stempel bersebelahan.

    Run paragraf kedua dipindah ke paragraf pertama, dipisahi satu spasi yang
    meniru format run pertamanya, lalu paragraf kedua dibuang."""
    merged = 0
    for row in table.findall(q('tr')):
        if '{%ttd}' not in text_of(row):
            continue
        for tc in row.findall(q('tc')):
            paras = tc.findall(q('p'))
            marks = [p for p in paras if '{%' in text_of(p)]
            if len(marks) < 2:
                continue
            first = marks[0]
            spacer = copy.deepcopy(first.findall(q('r'))[0])
            for child in list(spacer):
                if child.tag in (q('t'), q('tab'), q('br')):
                    spacer.remove(child)
            t = etree.SubElement(spacer, q('t'))
            t.text = ' '
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            first.append(spacer)
            for extra in marks[1:]:
                for r in extra.findall(q('r')):
                    first.append(r)
                tc.remove(extra)
            merged += 1
    return merged


def main():
    src = zipfile.ZipFile(TARGET)
    root = etree.fromstring(src.read(DOC))
    body = root.find(q('body'))

    table = sign_table(body)
    moved = normalize_blanks_before(body, table)
    shrunk = shrink_mark_row(table)
    merged = merge_mark_paragraphs(table)
    if not moved and shrunk is None and not merged:
        src.close()
        print('BAST.docx sudah rapi — tidak ada yang perlu diubah')
        return
    print('paragraf kosong sebelum tabel TTD: %+d (sisa 1); tinggi baris mark %s; '
          'sel mark digabung: %d'
          % (moved, '%s -> %s' % (shrunk, NEW_HEIGHT) if shrunk else 'sudah pas',
             merged))

    doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    items = [(i, src.read(i.filename)) for i in src.infolist()]
    src.close()
    with zipfile.ZipFile(TARGET, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in items:
            out.writestr(info, doc if info.filename == DOC else data)
    print('tulis', TARGET.relative_to(ROOT))


if __name__ == '__main__':
    main()
