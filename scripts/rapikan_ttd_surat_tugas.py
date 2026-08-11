"""Surat Tugas: satukan ttd+stempel jadi satu baris, buang jarak ke nama.

Body sebelum diperbaiki (indeks paragraf):

    26  'Bandung, {tanggalSurat}' <br> 'ENGINEER ... JAWA BARAT'  ind left=100
    27  '{%ttd}'        ind left=0
    28  '{%stempel}'    ind left=0
    29  ''  kosong
    30  ''  kosong
    31  ''  kosong (pStyle Title)
    32  '{namaPemberi}' ind firstLine=100

Word menumpuk ttd di atas stempel, dan tiga paragraf kosong ber-line=360
mendorong nama ~3 baris ke bawah — sama kelas cacat yang sudah diperbaiki di
BAST (scripts/rapikan_bast_halaman.py) dan BAKL (scripts/rapikan_ttd.py).

python-docx tidak bisa dipakai: file ini punya twip pecahan
(firstLine="41.99999999999999") yang bikin python-docx ValueError — pola sama
seperti scripts/bai_disewakan_bold.py. Pakai lxml + rewrite() dari
scripts/urutkan_ppr.py.

Idempoten: berhenti kalau paragraf {%ttd} sudah memuat {%stempel}.

    python scripts/rapikan_ttd_surat_tugas.py
"""
import zipfile
from pathlib import Path

from lxml import etree

from urutkan_ppr import rewrite

ROOT = Path(__file__).resolve().parent.parent
PATH = ROOT / 'templates' / 'docx' / 'SURAT_TUGAS.docx'
DOC = 'word/document.xml'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'


def q(tag):
    return '{%s}%s' % (W, tag)


def text_of(p):
    return ''.join(t.text or '' for t in p.iter(q('t')))


def is_blank(p):
    if text_of(p).strip():
        return False
    return not list(p.iter(q('drawing')))


def main():
    z = zipfile.ZipFile(PATH)
    root = etree.fromstring(z.read(DOC))
    z.close()
    body = root.find(q('body'))
    children = list(body)

    ttd_p = next(p for p in children if p.tag == q('p') and '{%ttd}' in text_of(p))
    if '{%stempel}' in text_of(ttd_p):
        print('SURAT_TUGAS.docx sudah rapi — tidak ada yang perlu diubah')
        return

    ttd_idx = children.index(ttd_p)
    stempel_p = children[ttd_idx + 1]
    assert '{%stempel}' in text_of(stempel_p), 'paragraf setelah {%ttd} bukan {%stempel}'

    # pindahkan run {%stempel} ke paragraf ttd, dipisah satu run spasi
    stempel_run = next(r for r in stempel_p.findall(q('r')) if '{%stempel}' in ''.join(
        t.text or '' for t in r.iter(q('t'))
    ))
    space_run = etree.fromstring(etree.tostring(stempel_run))
    for t in space_run.iter(q('t')):
        t.text = ' '
        t.set(XML_SPACE, 'preserve')
    ttd_p.append(space_run)
    ttd_p.append(stempel_run)
    body.remove(stempel_p)

    # keepNext supaya tidak terpisah dari nama saat pindah halaman
    pPr = ttd_p.find(q('pPr'))
    if pPr.find(q('keepNext')) is None:
        keep_next = etree.SubElement(pPr, q('keepNext'))
        pPr.remove(keep_next)
        pPr.insert(0, keep_next)
    keep_next = pPr.find(q('keepNext'))
    keep_next.set(q('val'), '1')

    # buang paragraf kosong di antara ttd dan {namaPemberi} — hanya yang
    # benar-benar tanpa teks dan tanpa drawing
    for p in list(body):
        if p is ttd_p:
            continue
        idx = list(body).index(p)
        if idx <= list(body).index(ttd_p):
            continue
        if '{namaPemberi}' in text_of(p):
            break
        if is_blank(p):
            body.remove(p)

    doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    rewrite(PATH, doc)
    print('tulis', PATH.relative_to(ROOT))

    z = zipfile.ZipFile(PATH)
    check = etree.fromstring(z.read(DOC))
    z.close()
    for p in check.iter(q('p')):
        t = text_of(p)
        if '{%ttd}' in t or '{namaPemberi}' in t:
            print(' ', repr(t))


if __name__ == '__main__':
    main()
