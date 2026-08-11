"""Urutkan ulang anak <w:pPr> sesuai skema OOXML CT_PPr di semua template.

CT_PPr itu sequence, bukan all — Word menolak buka file kalau urutannya salah.
BAI (19 paragraf) dan BAP (1) menaruh <w:tabs>/<w:ind> SETELAH <w:rPr>; <w:rPr>
wajib jadi anak terakhir sebelum <w:sectPr>. LibreOffice cuek soal ini (PDF
selalu terlihat benar), jadi cacatnya baru kelihatan saat pengguna buka
.docx-nya sendiri di Word.

Stable sort per <w:pPr>: elemen kembar (tidak ada di skema ini) tetap pada
urutan relatifnya, dan pPr yang sudah benar tidak disentuh sama sekali —
idempoten, no-op di file yang sudah bersih (BAKL, BAST, BA_PENGUJIAN, NODIN,
UID_JABAR terverifikasi bersih saat skrip ini ditulis).

    python scripts/urutkan_ppr.py
"""
import zipfile
from pathlib import Path

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = sorted((ROOT / 'templates' / 'docx').glob('*.docx'))
DOC = 'word/document.xml'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

PPR_ORDER = (
    'pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr '
    'suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap '
    'overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd '
    'snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc '
    'textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle '
    'rPr sectPr pPrChange'
).split()


def q(tag):
    return '{%s}%s' % (W, tag)


def periksa(root):
    """Kembalikan daftar (pPr, kids_saat_ini) yang urutannya salah."""
    bad = []
    for pPr in root.iter(q('pPr')):
        kids = [c for c in pPr if isinstance(c.tag, str)]
        names = [etree.QName(c).localname for c in kids]
        for n in names:
            if n not in PPR_ORDER:
                raise ValueError('elemen tak dikenal di pPr: %s' % n)
        idx = [PPR_ORDER.index(n) for n in names]
        if idx != sorted(idx):
            bad.append((pPr, kids))
    return bad


def reorder(pPr, kids):
    kids_sorted = sorted(kids, key=lambda c: PPR_ORDER.index(etree.QName(c).localname))
    for c in kids:
        pPr.remove(c)
    for c in kids_sorted:
        pPr.append(c)


def rewrite(path, doc_bytes):
    src = zipfile.ZipFile(path)
    items = [(i, src.read(i.filename)) for i in src.infolist()]
    src.close()
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in items:
            out.writestr(info, doc_bytes if info.filename == DOC else data)


def main():
    for path in TEMPLATES:
        z = zipfile.ZipFile(path)
        root = etree.fromstring(z.read(DOC))
        z.close()
        bad = periksa(root)
        if not bad:
            print('%-20s sudah rapi' % path.name)
            continue
        for pPr, kids in bad:
            reorder(pPr, kids)
        doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
        rewrite(path, doc)
        print('%-20s urutkan %d pPr' % (path.name, len(bad)))

    print('verifikasi ulang:')
    for path in TEMPLATES:
        z = zipfile.ZipFile(path)
        root = etree.fromstring(z.read(DOC))
        z.close()
        bad = periksa(root)
        assert not bad, '%s masih %d pPr salah urutan' % (path.name, len(bad))
        print('  %-20s 0 pelanggaran' % path.name)


if __name__ == '__main__':
    main()
