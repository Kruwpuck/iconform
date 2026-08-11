"""BAST: alamat pihak jangan merenggang, satu perangkat jangan terbelah halaman.

1. Tiap sel tabel pihak memakai <w:jc w:val="both">. Kolom nilainya sempit,
   jadi begitu alamat panjang wrap ("Jalan Bima Blok TZ No 15, RT 002 RW 014,
   Kelurahan Karang Timur, ...") justify menarik baris pertama sampai penuh dan
   spasinya melebar. Alamat pihak kedua paling sering kena karena paling
   panjang. Yang dibuang justify-nya — persis perbaikan yang sama sudah
   dilakukan di BAI (scripts/rapikan_justify_bai.py), fungsinya dipakai ulang.

2. Paragraf {perangkat} dan {jumlah} tidak punya w:keepNext maupun
   w:keepLines. Selama semua perangkat masih di satu halaman ini tidak terlihat
   — kolomnya sudah sejajar sejak {#items} dipisah (rapikan_bast_loop.py).
   Tapi begitu dokumen lewat satu halaman, perangkat yang posisinya dekat batas
   halaman bisa tercerai: "Perangkat" di halaman satu, "Jumlah" di halaman dua,
   atau nama perangkat yang panjang terbelah di tengah. Makin belakang nomor
   perangkatnya makin besar peluangnya. keepNext mengikat Perangkat ke Jumlah,
   keepLines menahan tiap baris pasangan itu tetap satu halaman.

Idempoten: jalan kedua kali tidak menemukan apa-apa.

    python scripts/rapikan_bast_alamat_perangkat.py
"""
import sys
import zipfile
from pathlib import Path

from lxml import etree

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rapikan_justify_bai import unjustify  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'templates' / 'docx' / 'BAST.docx'
DOC = 'word/document.xml'

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
# w:keepNext dan w:keepLines adalah anak pertama w:pPr menurut skema OOXML
# (setelah w:pStyle, yang tidak dipakai paragraf-paragraf ini)
KEEP = ('keepNext', 'keepLines')


def q(tag):
    return '{%s}%s' % (W, tag)


def text_of(el):
    return ''.join(t.text or '' for t in el.iter(q('t')))


def party_table(body):
    """Tabel pihak — tabel pertama, memuat "Selanjutnya disebut"."""
    tables = [el for el in body if el.tag == q('tbl')]
    return next(t for t in tables if 'Selanjutnya disebut' in text_of(t))


def keep_together(p, *names):
    """Sisipkan w:keepNext/w:keepLines di awal w:pPr kalau belum ada."""
    pPr = p.find(q('pPr'))
    added = 0
    for name in reversed(names):
        if pPr.find(q(name)) is None:
            pPr.insert(0, etree.Element(q(name)))
            added += 1
    return added


def item_paragraphs(body):
    """Paragraf isi loop: {perangkat} dan {jumlah}."""
    return [p for p in body if p.tag == q('p')
            and any(tag in text_of(p) for tag in ('{perangkat}', '{jumlah}'))]


def main():
    src = zipfile.ZipFile(TARGET)
    root = etree.fromstring(src.read(DOC))
    body = root.find(q('body'))

    cleared = 0
    for tc in party_table(body).iter(q('tc')):
        cleared += len(unjustify(tc))

    items = item_paragraphs(body)
    assert len(items) == 2, 'harus tepat dua paragraf isi loop: %d' % len(items)
    # Perangkat ikut Jumlah; Jumlah tidak perlu keepNext, di bawahnya {/items}
    kept = keep_together(items[0], *KEEP) + keep_together(items[1], 'keepLines')

    if not cleared and not kept:
        src.close()
        print('BAST.docx sudah rapi — tidak ada yang perlu diubah')
        return
    print('buang jc=both dari %d paragraf sel tabel pihak' % cleared)
    print('tambah %d penanda keep di paragraf perangkat/jumlah' % kept)

    doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    items_zip = [(i, src.read(i.filename)) for i in src.infolist()]
    src.close()
    with zipfile.ZipFile(TARGET, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in items_zip:
            out.writestr(info, doc if info.filename == DOC else data)
    print('tulis', TARGET.relative_to(ROOT))

    # cek: tidak ada justify sisa di tabel pihak, dan keep sudah terpasang
    root = etree.fromstring(zipfile.ZipFile(TARGET).read(DOC))
    body = root.find(q('body'))
    for tc in party_table(body).iter(q('tc')):
        for p in tc.findall(q('p')):
            pPr = p.find(q('pPr'))
            jc = None if pPr is None else pPr.find(q('jc'))
            assert jc is None or jc.get(q('val')) != 'both', text_of(p)
    a, b = item_paragraphs(body)
    assert a.find(q('pPr')).find(q('keepNext')) is not None
    assert a.find(q('pPr')).find(q('keepLines')) is not None
    assert b.find(q('pPr')).find(q('keepLines')) is not None
    print('cek lolos')


if __name__ == '__main__':
    main()
