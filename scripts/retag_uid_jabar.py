"""Rebuild templates/docx/UID_JABAR.docx from its master, re-tagged.

The shipped copy had drifted (wrong title, wrong opening sentence, 2880 indents
that stretched Originating/Terminating, empty signature row). Rather than patch
the drift, this rebuilds from the pristine master every run and re-applies the
docxtemplater tags — so it is idempotent by construction.

Run from the repo root:  python scripts/retag_uid_jabar.py

Note: the master is a Google Docs export with fractional twips
(w:ind left="535.95703125"), which python-docx chokes on. Everything here goes
through lxml attributes directly.
"""
import copy
import sys
import zipfile
from pathlib import Path

from lxml import etree

# jc=both punya masalah yang sama di sini: begitu nilainya wrap, spasinya
# melebar. Logikanya sudah ada di skrip BAI — dipakai ulang, bukan disalin.
from rapikan_justify_bai import unjustify

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / 'templates' / 'Berita Acara' / (
    'TEMPLATE DOK Berita Acara Instalasi – Aktivasi (BAI-BAA) JABAR.docx')
TARGET = ROOT / 'templates' / 'docx' / 'UID_JABAR.docx'
BAI = ROOT / 'templates' / 'docx' / 'BAI.docx'

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
XML = 'http://www.w3.org/XML/1998/namespace'


def q(tag):
    return '{%s}%s' % (W, tag)


# ── run rewriting ─────────────────────────────────────────────────────────────
# Every {tag} must live whole inside one <w:t> in one run; docxtemplater cannot
# read a tag split across runs. So we always rebuild a paragraph's runs from a
# [(text, bold)] spec instead of editing the Google Docs run soup in place.

# rPr child order per OOXML: rStyle, rFonts, b, bCs, i, ... — w:b goes after
# rFonts (neither is present in this master, so it lands first).
_RPR_BEFORE_B = (q('rStyle'), q('rFonts'))


def _bold_rpr(rpr):
    """Copy of rpr with <w:b/>/<w:bCs/> inserted in schema order."""
    out = copy.deepcopy(rpr) if rpr is not None else etree.Element(q('rPr'))
    if out.find(q('b')) is not None:
        return out
    at = 0
    for i, ch in enumerate(out):
        if ch.tag in _RPR_BEFORE_B:
            at = i + 1
    for j, name in enumerate(('b', 'bCs')):
        el = etree.Element(q(name))
        el.set(q('val'), '1')
        out.insert(at + j, el)
    return out


def set_runs(p, parts):
    """Replace p's runs with one run per (text, bold) part.

    Formatting templates come from the paragraph's own runs, so the master's
    fonts/sizes survive. Tabs in the text become <w:tab/> elements.
    """
    old = p.findall(q('r'))
    plain = bold = None
    for r in old:
        rpr = r.find(q('rPr'))
        if rpr is None:
            continue
        if rpr.find(q('b')) is not None:
            bold = bold if bold is not None else rpr
        else:
            plain = plain if plain is not None else rpr
    if plain is None and bold is not None:
        plain = bold
    if bold is None:
        bold = _bold_rpr(plain)

    for r in old:
        p.remove(r)

    for text, is_bold in parts:
        run = etree.SubElement(p, q('r'))
        tmpl = bold if is_bold else plain
        if tmpl is not None:
            run.append(copy.deepcopy(tmpl))
        for i, chunk in enumerate(text.split('\t')):
            if i:
                etree.SubElement(run, q('tab'))
            if chunk:
                t = etree.SubElement(run, q('t'))
                t.set('{%s}space' % XML, 'preserve')
                t.text = chunk


# ── what each body child becomes ──────────────────────────────────────────────
# Sample values from the master are dropped entirely; fillBlanks() in
# src/lib/docxgen.ts prints "......................" for anything left empty.

SENTENCE = [
    ('Pada hari ini ', False), ('{hari} ', True),
    ('Tanggal ', False), ('{tanggal} ', True),
    ('Bulan ', False), ('{bulan} ', True),
    ('Tahun ', False), ('{tahun} ', True),
    ('telah dilakukan pekerjaan aktivasi layanan yang disewa oleh ', False),
    ('{disewakanOleh}', True),
    ('. Dengan hasil ', False), ('BAIK', True),
    (', Adapun spesifikasi sebagai berikut:', False),
]

BODY = {
    1: SENTENCE,
    # plain, like the master: only the opening sentence is bolded
    3: [('Nama Layanan \t: {namaLayanan}', False)],
    4: [('Service ID\t: {serviceId}', False)],
    5: [('Interface\t: {interface}', False)],
    6: [('Bandwidth\t: {bandwidth}', False)],
    7: [('Originating\t: {originating}', False)],
    8: [('Terminating\t: {terminating}', False)],
    9: [('No PA\t: {noPA}', False)],
    11: [('Nama Pelanggan\t: {namaPelanggan}', False)],
    12: [('Terminating\t: {terminating}', False)],  # yes, twice — that is the master
    14: [('Nama Perangkat\t: {namaPerangkat}\tSN: {snPerangkat}', False)],
    15: [('Alamat/Lokasi POP\t: {alamatPOP}', False)],
    16: [('Koordinat POP\t: {koordinatPOP}', False)],
    17: [('Nama Perangkat POP\t: {namaPerangkatPOP}\tSN: {snPOP}', False)],
    18: [('Kanal/Port\t: {kanalPort}', False)],
    19: [('Jarak OTDR\t: {jarakOTDR}', False)],
    22: [('Nama \t: {namaWakil}', False)],
    23: [('Jabatan\t: {jabatanWakil}', False)],
    24: [('Alamat Kantor\t: {alamatKantor}', False)],
    25: [('Nomor Telp/HP, Email\t: {kontakWakil}', False)],
    28: [('Nama Project Team Leader : {namaProjectLeader}', False)],
}

# signature table: row -> cell -> list of paragraph specs
TABLE = {
    0: [[[('{instansiPelanggan}', True)]], [[('PT PLN ICON PLUS', True)]]],
    1: [[[('{%ttd2}', False)], [('{%stempel2}', False)]],
        [[('{%ttd}', False)], [('{%stempel}', False)]]],
    2: [[[('( {namaWakil} )', False)]], [[('( {namaProjectLeader} )', False)]]],
}


def fill_cell(tc, para_specs):
    """Make tc hold exactly len(para_specs) paragraphs, cloning the first for extras.

    Equal paragraph counts left and right is what keeps the two signature names
    on the same baseline (scripts/revisi3.py:159 blanked a spare paragraph
    instead of removing it, which is how they drifted apart before).
    """
    paras = tc.findall(q('p'))
    while len(paras) > len(para_specs):
        tc.remove(paras.pop())
    while len(paras) < len(para_specs):
        clone = copy.deepcopy(paras[0])
        paras[-1].addnext(clone)
        paras.append(clone)
    for p, spec in zip(paras, para_specs):
        set_runs(p, spec)


def set_row_height(tr, val='1481'):
    trPr = tr.find(q('trPr'))
    if trPr is None:
        trPr = etree.Element(q('trPr'))
        tr.insert(0, trPr)
    h = trPr.find(q('trHeight'))
    if h is None:
        h = etree.Element(q('trHeight'))
        # trPr order: cantSplit, trHeight, tblHeader
        after = trPr.find(q('cantSplit'))
        (after.addnext(h) if after is not None else trPr.insert(0, h))
    h.set(q('val'), val)
    h.set(q('hRule'), 'atLeast')


# ── layout ────────────────────────────────────────────────────────────────────

# The master parks the value column at 2127 twips, which Google Docs' own Arial
# just fits. LibreOffice renders with Liberation Sans, a hair wider, and the two
# longest labels ("Nama Perangkat POP", "Nomor Telp/HP, Email") overrun 2127 by
# ~2px — the tab then skips to the next stop at 7088 and the line falls apart.
# Widening the shared column keeps every colon aligned and buys the headroom.
MASTER_COL, LABEL_COL = '2127', '2400'


def widen_label_column(body):
    for tab in body.iter(q('tab')):
        if tab.get(q('pos')) == MASTER_COL:
            tab.set(q('pos'), LABEL_COL)
    for ind in body.iter(q('ind')):
        for attr in ('left', 'hanging'):
            if ind.get(q(attr)) == MASTER_COL:
                ind.set(q(attr), LABEL_COL)


def drop_trailing_blanks(body):
    """Empty paragraphs after the signature table spill onto a second page that
    holds nothing but the repeated header logo."""
    kids = list(body)
    end = len(kids) - 1 if kids and kids[-1].tag == q('sectPr') else len(kids)
    for el in reversed(kids[:end]):
        if el.tag != q('p') or ''.join(t.text or '' for t in el.iter(q('t'))).strip():
            break
        body.remove(el)


# ── build ─────────────────────────────────────────────────────────────────────

def build():
    src = zipfile.ZipFile(MASTER)
    root = etree.fromstring(src.read('word/document.xml'))
    body = root.find(q('body'))

    for i, spec in BODY.items():
        set_runs(body[i], spec)

    tbl = body.findall(q('tbl'))[-1]
    rows = tbl.findall(q('tr'))
    for ri, cells in TABLE.items():
        tr = rows[ri]
        tcs = tr.findall(q('tc'))
        for tc, para_specs in zip(tcs, cells):
            fill_cell(tc, para_specs)
    set_row_height(rows[1])

    widen_label_column(body)
    unjustify(body)
    drop_trailing_blanks(body)

    doc = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(TARGET, 'w', zipfile.ZIP_DEFLATED) as out:
        for item in src.infolist():  # header1.xml + media/image1.png ride along
            out.writestr(item, doc if item.filename == 'word/document.xml'
                         else src.read(item.filename))
    src.close()
    print('wrote', TARGET.relative_to(ROOT))


# ── verify ────────────────────────────────────────────────────────────────────

def tags(path):
    xml = zipfile.ZipFile(path).read('word/document.xml').decode('utf8')
    import re
    return set(re.findall(r'\{[^}]+\}', re.sub(r'<[^>]+>', '', xml)))


def ptext(p):
    out = []
    for n in p.iter():
        parent = n.getparent()
        if parent is not None and parent.tag == q('tabs'):
            continue  # tab *stops* live in pPr; they are not content
        if n.tag == q('t'):
            out.append(n.text or '')
        elif n.tag == q('tab'):
            out.append('\t')
    return ''.join(out)


def pfmt(p):
    pPr = p.find(q('pPr'))
    if pPr is None:
        return ''
    bits = []
    ind = pPr.find(q('ind'))
    if ind is not None:
        bits.append('ind=' + str({k.split('}')[1]: v for k, v in ind.attrib.items()}))
    ts = pPr.find(q('tabs'))
    if ts is not None:
        bits.append('tabs=' + str([t.get(q('pos')) for t in ts]))
    jc = pPr.find(q('jc'))
    if jc is not None:
        bits.append('jc=' + jc.get(q('val')))
    return '  '.join(bits)


SAMPLES = ['Selasa', 'Februari', 'INTERNET CORPORATE', '121303002509',
           'A121303002501', 'Nadhif Ahmad Dhialdien', 'Existing', 'JL. ASIA AFRIKA']
TITLE = 'Berita Acara Instalasi – Aktivasi (BAI-BAA)'


def verify():
    root = etree.fromstring(zipfile.ZipFile(TARGET).read('word/document.xml'))
    body = root.find(q('body'))

    print('\n--- body dump ---')
    for i, ch in enumerate(body):
        name = ch.tag.split('}')[1]
        if name == 'p':
            print('%3d %-62r %s' % (i, ptext(ch), pfmt(ch)))
        elif name == 'tbl':
            print('%3d TBL' % i)
            for ri, tr in enumerate(ch.findall(q('tr'))):
                trPr = tr.find(q('trPr'))
                pr = [c.tag.split('}')[1] + str(dict((k.split('}')[1], v) for k, v in c.attrib.items()))
                      for c in (trPr if trPr is not None else [])]
                print('    row %d %s' % (ri, ' '.join(pr)))
                for ci, tc in enumerate(tr.findall(q('tc'))):
                    ps = tc.findall(q('p'))
                    print('      cell %d: %d para(s)' % (ci, len(ps)))
                    for p in ps:
                        print('        %-40r %s' % (ptext(p), pfmt(p)))
        else:
            print('%3d %s' % (i, name))

    print('\n--- checks ---')
    assert ptext(body[0]) == TITLE, ptext(body[0])
    print('title OK:', TITLE)

    full = ''.join(ptext(p) for p in body.iter(q('p')))
    leftovers = [s for s in SAMPLES if s in full]
    assert not leftovers, 'leftover sample text: %s' % leftovers
    print('no leftover sample text')

    mine, theirs = tags(TARGET), tags(BAI)
    print('tags: %d, matches BAI: %s' % (len(mine), mine == theirs))
    if mine != theirs:
        print('  only here :', sorted(mine - theirs))
        print('  only BAI  :', sorted(theirs - mine))
    assert mine == theirs

    # every {tag} whole inside one <w:t>
    for t in root.iter(q('t')):
        txt = t.text or ''
        assert txt.count('{') == txt.count('}'), 'split tag: %r' % txt

    tbl = body.findall(q('tbl'))[-1]
    for ri, tr in enumerate(tbl.findall(q('tr'))):
        counts = [len(tc.findall(q('p'))) for tc in tr.findall(q('tc'))]
        assert len(set(counts)) == 1, 'row %d paragraph counts differ: %s' % (ri, counts)
    print('signature table: equal paragraph counts in every row')

    # justify hanya di prosa: baris berkolom yang wrap akan merenggang
    justified = [ptext(p)[:40] for p in body.iter(q('p'))
                 if (p.find(q('pPr')) is not None
                     and p.find(q('pPr')).find(q('jc')) is not None
                     and p.find(q('pPr')).find(q('jc')).get(q('val')) == 'both')]
    assert all(t.strip().startswith(('Pada hari ini', 'Demikian berita acara'))
               for t in justified), 'jc=both di luar prosa: %s' % justified
    print('jc=both hanya di %d paragraf prosa' % len(justified))
    print('all checks passed')


if __name__ == '__main__':
    if not MASTER.exists():
        sys.exit('master not found: %s' % MASTER)
    build()
    verify()
