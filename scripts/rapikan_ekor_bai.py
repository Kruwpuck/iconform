"""Buang paragraf kosong di ekor BAI.docx.

Setelah tabel tanda tangan ada empat paragraf kosong. Isinya sendiri masih muat
di halaman satu, tapi keempat paragraf itu melewati batas bawah — LibreOffice
lalu membuat halaman kedua yang isinya cuma logo header yang berulang.

UID_JABAR punya ekor yang sama, tapi ditangani di scripts/retag_uid_jabar.py
karena file itu dibangun ulang dari masternya setiap kali dijalankan.

Idempoten: jalan kedua kali tidak menemukan apa-apa dan tidak menulis ulang.

    python scripts/rapikan_ekor_bai.py
"""
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / 'templates' / 'docx' / 'BAI.docx'

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'


def q(tag):
    return '{%s}%s' % (W, tag)


def trailing_blanks(body):
    """Paragraf kosong di ujung body, dari belakang, berhenti di elemen berisi.
    w:sectPr selalu jadi anak terakhir dan bukan paragraf, jadi dilewati."""
    kids = list(body)
    end = len(kids) - 1 if kids and kids[-1].tag == q('sectPr') else len(kids)
    out = []
    for el in reversed(kids[:end]):
        if el.tag != q('p'):
            break
        if ''.join(t.text or '' for t in el.iter(q('t'))).strip():
            break
        out.append(el)
    return out


def main():
    src = zipfile.ZipFile(TARGET)
    root = etree.fromstring(src.read('word/document.xml'))
    body = root.find(q('body'))

    blanks = trailing_blanks(body)
    if not blanks:
        src.close()
        print('BAI.docx sudah rapi — tidak ada paragraf kosong di ekor')
        return

    before = len(list(body))
    for el in blanks:
        body.remove(el)
    print('hapus %d paragraf kosong di ekor; anak body %d -> %d'
          % (len(blanks), before, len(list(body))))

    doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    items = [(i, src.read(i.filename)) for i in src.infolist()]
    src.close()
    with zipfile.ZipFile(TARGET, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in items:
            out.writestr(info, doc if info.filename == 'word/document.xml' else data)
    print('tulis', TARGET.relative_to(ROOT))


if __name__ == '__main__':
    main()
