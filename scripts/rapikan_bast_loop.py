"""BAST: pindahkan {#items} ke paragrafnya sendiri.

Sebelumnya tag pembuka loop menempel pada teks: run pertama p10 berisi
'{#items}Perangkat'. Karena tag tidak berdiri sendiri di paragrafnya,
docxtemplater memotong loop di tengah paragraf — blok yang diulang berakhir
di *pembuka* paragraf '{/items}', sehingga iterasi ke-2 dan seterusnya
memakai w:pPr milik paragraf '{/items}' (ind left=567, tab hanya di 2160)
bukan milik paragraf 'Perangkat' (left=2340 hanging=1773, tab 2160 + 2340).
Akibatnya baris pertama rapi, baris berikutnya kolomnya melompat.

BAKL.docx sudah memakai pola yang benar: '{#kendala}' sendiri di satu
paragraf, isinya di paragraf berikutnya, '{/kendala}' sendiri lagi. Dengan
paragraphLoop:true kedua paragraf tag itu dibuang saat render, jadi tidak
menambah baris kosong. Script ini menyamakan BAST ke pola tersebut.

Idempoten: jalan kedua kali tidak menemukan apa-apa.

    python scripts/rapikan_bast_loop.py
"""
import copy
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'templates' / 'docx' / 'BAST.docx'
DOC = 'word/document.xml'

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
OPEN, CLOSE = '{#items}', '{/items}'


def q(tag):
    return '{%s}%s' % (W, tag)


def text_of(p):
    return ''.join(t.text or '' for t in p.iter(q('t')))


def strip_open_tag(p):
    """Buang '{#items}' dari run pertama yang memuatnya."""
    for t in p.iter(q('t')):
        if OPEN in (t.text or ''):
            t.text = (t.text or '').replace(OPEN, '')
            if (t.text or '') != (t.text or '').strip():
                t.set(XML_SPACE, 'preserve')
            return True
    return False


def tag_paragraph(model, tag):
    """Paragraf berisi satu run '{tag}' saja, meniru bentuk paragraf model."""
    p = copy.deepcopy(model)
    runs = p.findall(q('r'))
    for extra in runs[1:]:
        p.remove(extra)
    r = runs[0]
    for child in list(r):
        if child.tag in (q('t'), q('tab'), q('br')):
            r.remove(child)
    t = etree.SubElement(r, q('t'))
    t.text = tag
    return p


def main():
    src = zipfile.ZipFile(TARGET)
    root = etree.fromstring(src.read(DOC))
    body = root.find(q('body'))

    paras = [el for el in body if el.tag == q('p')]
    if any(text_of(p).strip() == OPEN for p in paras):
        src.close()
        print('BAST.docx sudah rapi — {#items} berdiri sendiri')
        return

    host = next(p for p in paras if OPEN in text_of(p))
    closer = next(p for p in paras if text_of(p).strip() == CLOSE)
    assert host is not closer, 'paragraf pembuka dan penutup tidak boleh sama'

    assert strip_open_tag(host), 'tag pembuka tidak ditemukan di run mana pun'
    body.insert(list(body).index(host), tag_paragraph(closer, OPEN))
    print('sisip paragraf {#items} sebelum %r' % text_of(host)[:40])

    doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    items = [(i, src.read(i.filename)) for i in src.infolist()]
    src.close()
    with zipfile.ZipFile(TARGET, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in items:
            out.writestr(info, doc if info.filename == DOC else data)
    print('tulis', TARGET.relative_to(ROOT))


if __name__ == '__main__':
    main()
