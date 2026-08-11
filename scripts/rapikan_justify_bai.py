"""BAI: baris spesifikasi rata kiri, kolom label disamakan dengan UID JABAR.

Baris "Nama Pelanggan\t: {namaPelanggan}" merenggang jadi
"MANAGE  SERVICE  RADIO  TRUNKING  -  RADIO" karena paragrafnya
<w:jc w:val="both">. Nilainya memang tidak muat satu baris — kolom nilai
mulai di 2880 twip sedangkan lebar teks 9026 twip (11906 - 1440 - 1440), jadi
sisanya 6146 twip (307 pt) sementara nama layanan 52 karakter kapital butuh
~390 pt. Begitu wrap, justify menarik baris pertama sampai penuh dan spasinya
melebar.

Contoh surat yang benar juga wrap (baris "Terminating" jadi dua baris), tapi
tidak merenggang — di sana blok spesifikasinya rata kiri. Jadi yang dibuang
justify-nya, bukan wrap-nya.

Yang tetap rata kanan-kiri: dua paragraf prosa — kalimat pembuka
("Pada hari ini ...") dan penutup ("Demikian berita acara ...") — sama seperti
contohnya. Judul tetap <w:jc w:val="center">.

Kolom labelnya juga terlalu lebar: 2880 twip, sementara contohnya 2127 dan
UID_JABAR 2400. Diturunkan ke 2400 — nilai dapat 480 twip (24 pt) tambahan dan
celah label ke titik dua jadi sama dengan UID JABAR. Tidak sampai 2127 karena
label terpanjang ("Nomor Telp/HP, Email", "Nama Perangkat POP") diukur dari
render berakhir di ~2250 twip; 2127 membuat tab melompat ke stop berikutnya dan
barisnya rusak — masalah yang sama sudah pernah kena di UID_JABAR
(scripts/retag_uid_jabar.py:188).

Idempoten: jalan kedua kali tidak menemukan apa-apa.

    python scripts/rapikan_justify_bai.py
"""
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'templates' / 'docx' / 'BAI.docx'
DOC = 'word/document.xml'

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
# prosa: kalimatnya memang enak dibaca rata kanan-kiri, dan tidak ada kolom
# yang bisa rusak di situ
PROSA = ('Pada hari ini', 'Demikian berita acara')
OLD_COL, LABEL_COL = '2880', '2400'


def q(tag):
    return '{%s}%s' % (W, tag)


def text_of(p):
    return ''.join(t.text or '' for t in p.iter(q('t')))


def unjustify(body):
    """Buang <w:jc val="both"> dari tiap paragraf selain prosa."""
    hit = []
    for i, p in enumerate(body):
        if p.tag != q('p'):
            continue
        pPr = p.find(q('pPr'))
        jc = None if pPr is None else pPr.find(q('jc'))
        if jc is None or jc.get(q('val')) != 'both':
            continue
        if text_of(p).strip().startswith(PROSA):
            continue
        pPr.remove(jc)
        hit.append(i)
    return hit


def narrow_label_column(body):
    """Kolom label 2880 -> 2400, di tab stop maupun indent.

    Tab stop kedua (5760, kolom "SN:") dibiarkan — bukan kolom label."""
    moved = 0
    for tab in body.iter(q('tab')):
        if tab.get(q('pos')) == OLD_COL:
            tab.set(q('pos'), LABEL_COL)
            moved += 1
    for ind in body.iter(q('ind')):
        for attr in ('left', 'hanging'):
            if ind.get(q(attr)) == OLD_COL:
                ind.set(q(attr), LABEL_COL)
                moved += 1
    return moved


def main():
    src = zipfile.ZipFile(TARGET)
    root = etree.fromstring(src.read(DOC))
    body = root.find(q('body'))

    hit = unjustify(body)
    moved = narrow_label_column(body)
    if not hit and not moved:
        src.close()
        print('BAI.docx sudah rapi — tidak ada yang perlu diubah')
        return
    print('buang jc=both dari %d paragraf: %s' % (len(hit), hit))
    print('kolom label %s -> %s di %d tempat' % (OLD_COL, LABEL_COL, moved))

    doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    items = [(i, src.read(i.filename)) for i in src.infolist()]
    src.close()
    with zipfile.ZipFile(TARGET, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in items:
            out.writestr(info, doc if info.filename == DOC else data)
    print('tulis', TARGET.relative_to(ROOT))


if __name__ == '__main__':
    main()
