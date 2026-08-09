"""BAI: pisahkan "disewa oleh" dari Nama Pelanggan, dan tebalkan Nama Layanan.

1. Kalimat pembuka memakai {namaPelanggan} untuk mengisi "yang disewa oleh".
   Penyewa sering berbeda dari nama pelanggan pada blok spesifikasi, jadi
   kalimat pembuka kini memakai tag sendiri: {disewakanOleh}.
   Blok "Nama Pelanggan: {namaPelanggan}" tidak disentuh.

2. {namaLayanan} harus tercetak tebal — di kalimat pembuka dan di baris
   "Nama Layanan : ". Keduanya berada di dalam run non-bold, jadi run-nya
   dipecah supaya tag berdiri di run sendiri dengan <w:b/>; sisa rPr
   (font, ukuran, w:rtl) disalin apa adanya. Setiap {tag} tetap utuh dalam
   satu <w:t> — docxtemplater tidak bisa membaca tag yang terbelah run.

Dijalankan dari root repo. Idempotent: jalan kedua kali tidak mengubah apa pun.
Semua atribut dibaca lewat lxml, bukan python-docx — file ini ekspor Google Docs
dan menyimpan twip pecahan (535.95703125) yang bikin python-docx ValueError.
"""
import copy
import re
import zipfile
from pathlib import Path

from lxml import etree

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
PATH = Path('templates/docx/BAI.docx')
DOC = 'word/document.xml'
TAG = re.compile(r'\{%?[^{}]+\}')
# urutan anak w:rPr menurut skema OOXML — w:b harus setelah rStyle/rFonts
BEFORE_B = (W + 'rStyle', W + 'rFonts')


def tags(xml: bytes) -> list:
    root = etree.fromstring(xml)
    out = []
    for i, p in enumerate(root.find(W + 'body')):
        text = ''.join(t.text or '' for t in p.iter(W + 't'))
        out += [(i, t) for t in TAG.findall(text)]
    return out


def set_bold(run) -> None:
    rPr = run.find(W + 'rPr')
    if rPr is None:
        rPr = etree.SubElement(run, W + 'rPr')
        run.remove(rPr)
        run.insert(0, rPr)
    for old in rPr.findall(W + 'b'):
        rPr.remove(old)
    b = etree.Element(W + 'b')
    pos = sum(1 for c in rPr if c.tag in BEFORE_B)
    rPr.insert(pos, b)


def set_text(run, text: str) -> None:
    """Run hanya menyisakan satu w:t berisi `text` (tab/br ikut terbuang)."""
    t = run.find(W + 't')
    for child in list(run):
        if child.tag in (W + 't', W + 'tab', W + 'br') and child is not t:
            run.remove(child)
    t.text = text
    preserve(t)


def preserve(t) -> None:
    if (t.text or '') != (t.text or '').strip():
        t.set(XML_SPACE, 'preserve')
    elif XML_SPACE in t.attrib:
        del t.attrib[XML_SPACE]


def already_bold(p) -> bool:
    """Paragraf sudah punya run tersendiri berisi {namaLayanan}."""
    for r in p.findall(W + 'r'):
        ts = r.findall(W + 't')
        if len(ts) == 1 and (ts[0].text or '') == '{namaLayanan}':
            return True
    return False


def fix_opening(p) -> bool:
    """Kalimat pembuka: namaPelanggan -> disewakanOleh, {namaLayanan} bold."""
    if already_bold(p):
        return False
    for r in p.findall(W + 'r'):
        ts = r.findall(W + 't')
        if len(ts) != 1 or 'telah dilakukan pekerjaan' not in (ts[0].text or ''):
            continue
        pre, _, post = (ts[0].text).partition('{namaLayanan}')
        post = post.replace('{namaPelanggan}', '{disewakanOleh}')
        at = list(p).index(r)
        p.remove(r)
        for off, (text, bold) in enumerate(
            ((pre, False), ('{namaLayanan}', True), (post, False))
        ):
            new = copy.deepcopy(r)
            set_text(new, text)
            if bold:
                set_bold(new)
            p.insert(at + off, new)
        return True
    return False


def fix_label(p) -> bool:
    """Baris "Nama Layanan \t: {namaLayanan}": tagnya pindah ke run bold."""
    if already_bold(p):
        return False
    for r in p.findall(W + 'r'):
        ts = r.findall(W + 't')
        if not ts or '{namaLayanan}' not in (ts[-1].text or ''):
            continue
        pre, _, post = (ts[-1].text).partition('{namaLayanan}')
        ts[-1].text = pre           # run asli berhenti tepat sebelum tag
        preserve(ts[-1])
        at = list(p).index(r) + 1
        for off, (text, bold) in enumerate((('{namaLayanan}', True), (post, False))):
            if not text:
                continue
            new = copy.deepcopy(r)
            set_text(new, text)
            if bold:
                set_bold(new)
            p.insert(at + off, new)
        return True
    return False


def dump(root, *indexes) -> None:
    body = root.find(W + 'body')
    for i in indexes:
        print('  paragraf %d:' % i)
        for r in body[i].findall(W + 'r'):
            rPr = r.find(W + 'rPr')
            b = None if rPr is None else rPr.find(W + 'b')
            bold = 'bold' if b is not None and b.get(W + 'val') != '0' else '    '
            parts = ''.join(
                '\\t' if c.tag == W + 'tab' else (c.text or '')
                for c in r
                if c.tag in (W + 't', W + 'tab')
            )
            print('    [%s] %r' % (bold, parts))


def main() -> None:
    with zipfile.ZipFile(PATH) as z:
        entries = [(i, z.read(i.filename)) for i in z.infolist()]
    before = next(d for i, d in entries if i.filename == DOC)

    root = etree.fromstring(before)
    body = root.find(W + 'body')
    opening = next(p for p in body.iter(W + 'p')
                   if 'telah dilakukan pekerjaan' in ''.join(t.text or '' for t in p.iter(W + 't')))
    label = next(p for p in body.iter(W + 'p')
                 if ''.join(t.text or '' for t in p.iter(W + 't')).startswith('Nama Layanan'))

    changed = fix_opening(opening) | fix_label(label)
    if not changed:
        print('already applied — nothing to do')
        dump(root, 1, 3)
        return

    after = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    tmp = PATH.with_name(PATH.name + '.tmp')
    with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as out:
        for info, data in entries:
            out.writestr(info, after if info.filename == DOC else data)
    tmp.replace(PATH)

    old, new = tags(before), tags(after)
    print('tag diff:')
    for t in sorted(set(old) - set(new)):
        print('  -', t)
    for t in sorted(set(new) - set(old)):
        print('  +', t)
    print('runs after:')
    dump(etree.fromstring(after), 1, 3)


if __name__ == '__main__':
    main()
