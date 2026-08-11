"""Satukan {%ttd}+{%stempel} (dan pasangan ke-2) jadi satu paragraf.

src/lib/docxgen.ts:floatMarks() mengubah setiap drawing mark jadi anchor
"in front of text". Mark floating tidak menambah tinggi baris, jadi kalau ttd
dan stempel duduk di paragraf terpisah keduanya jatuh di titik yang sama dan
saling menutupi. Dalam satu paragraf, floatMarks() menggeser mark kedua
sejauh lebar mark pertama — berdampingan dan rapat.

Sekaligus menyisakan tinggi mark di bawah paragraf itu (spacing after=680 twip
= 34pt = SIGNATURE_HEIGHT_PX 45px @96dpi) supaya nama di bawahnya tidak
tertimpa.

BAST dan SURAT_TUGAS sudah satu paragraf — hanya spacing-nya diset (idempoten).

    python scripts/satukan_mark.py
    python scripts/urutkan_ppr.py   # w:spacing yang baru dibuat perlu dirapikan
"""
import zipfile
from pathlib import Path

from lxml import etree

from urutkan_ppr import rewrite

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = sorted((ROOT / 'templates' / 'docx').glob('*.docx'))
DOC = 'word/document.xml'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
PASANGAN = [('{%ttd}', '{%stempel}'), ('{%ttd2}', '{%stempel2}')]
RUANG_BAWAH = '680'


def q(tag):
    return '{%s}%s' % (W, tag)


def text_of(el):
    return ''.join(t.text or '' for t in el.iter(q('t')))


def sisakan_ruang(p):
    pPr = p.find(q('pPr'))
    if pPr is None:
        pPr = etree.Element(q('pPr'))
        p.insert(0, pPr)
    spacing = pPr.find(q('spacing'))
    if spacing is None:
        spacing = etree.SubElement(pPr, q('spacing'))
    spacing.set(q('after'), RUANG_BAWAH)


def gabung(root, ttd_tag, stempel_tag):
    """Pindahkan run stempel ke paragraf ttd. True kalau paragraf digabung."""
    ttd_p = next((p for p in root.iter(q('p')) if ttd_tag in text_of(p)), None)
    if ttd_p is None:
        return False
    if stempel_tag in text_of(ttd_p):
        sisakan_ruang(ttd_p)
        return False

    stempel_p = next((p for p in root.iter(q('p')) if stempel_tag in text_of(p)), None)
    assert stempel_p is not None, 'ada %s tapi tidak ada %s' % (ttd_tag, stempel_tag)
    stempel_run = next((r for r in stempel_p.findall(q('r')) if stempel_tag in text_of(r)), None)
    assert stempel_run is not None, 'run %s tidak ketemu' % stempel_tag

    ttd_p.append(stempel_run)
    # paragraf stempel yang jadi kosong dibuang, bukan disisakan sebagai baris
    if not text_of(stempel_p).strip() and not list(stempel_p.iter(q('drawing'))):
        stempel_p.getparent().remove(stempel_p)
    sisakan_ruang(ttd_p)
    return True


def main():
    for path in TEMPLATES:
        z = zipfile.ZipFile(path)
        root = etree.fromstring(z.read(DOC))
        z.close()
        if not any(t in text_of(root) for t, _ in PASANGAN):
            print('%-20s tanpa mark' % path.name)
            continue
        ubah = [gabung(root, a, b) for a, b in PASANGAN]
        doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
        rewrite(path, doc)
        print('%-20s %s' % (path.name, 'digabung' if any(ubah) else 'sudah satu paragraf'))

    print('verifikasi:')
    for path in TEMPLATES:
        root = etree.fromstring(zipfile.ZipFile(path).read(DOC))
        sisa = [
            repr(text_of(p))
            for p in root.iter(q('p'))
            if any(t in text_of(p) for t in ('{%stempel}', '{%stempel2}'))
            and not any(t in text_of(p) for t in ('{%ttd}', '{%ttd2}'))
        ]
        assert not sisa, '%s masih punya stempel sendirian: %s' % (path.name, sisa)
        print('  %-20s ok' % path.name)


if __name__ == '__main__':
    main()
