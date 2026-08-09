"""Three BAST.docx fixes: logo overhang, wrapped Perangkat value, PIHAK PERTAMA ttd.

D1 the header logo anchored at 5057700 EMU + 1652588 wide ends at 6710288, but
   the paper's right edge sits at 6645910 from the column origin (9026tw text
   column + 1in right margin). It hung 64378 EMU off the page. Shift left 0.25in.

D2 "Perangkat<tab>: {perangkat}" had one tab stop and no hanging indent, so a
   long value's second line fell back to the left margin. Colon and value now
   get their own tab columns and the paragraph hangs at the value column, so
   continuation lines sit directly under the value.

D3 BAST is twoParties, but only PIHAK KEDUA's cell had signature tags. Mirror
   BAI's layout: {%ttd2}/{%stempel2} in the left cell, and a trHeight tall
   enough for a signature mark.

Idempotent: every step checks the file first. Runs from the repo root.

python-docx is deliberately not used — these are Google Docs exports and store
fractional twips ("535.95703125") that its int() properties choke on.
"""
import shutil
import zipfile
from copy import deepcopy
from pathlib import Path

from lxml import etree

PATH = Path('templates/docx/BAST.docx')
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
W14 = '{http://schemas.microsoft.com/office/word/2010/wordml}'
WP = '{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}'

POS_OFFSET = '4829100'  # was 5057700; 228600 EMU = 0.25in left
LABEL_TAB = '2160'      # colon column
VALUE_TAB = '2340'      # value column, where wrapped lines line up
IND_LEFT = '2340'
IND_HANGING = '1773'    # 2340 - 1773 = 567, the original first-line indent
SIG_HEIGHT = '1481'     # same as BAI.docx — one signature mark is 33.75pt
# w:trPr children must stay in schema order
TRPR_ORDER = [W + 'cnfStyle', W + 'divId', W + 'gridBefore', W + 'gridAfter',
              W + 'wBefore', W + 'wAfter', W + 'cantSplit', W + 'trHeight',
              W + 'tblHeader']


def fix_logo(root):
    """D1 — pull the anchored logo back inside the paper."""
    offset = root.find('.//' + WP + 'positionH/' + WP + 'posOffset')
    if offset.text == POS_OFFSET:
        return False
    offset.text = POS_OFFSET
    return True


def fix_hanging(p, tag):
    """D2 — split ': {value}' into ':' <tab> '{value}' and hang at the value column."""
    pPr = p.find(W + 'pPr')
    tabs = pPr.find(W + 'tabs')
    if len(tabs) > 1:
        return False

    second = deepcopy(tabs[0])
    second.set(W + 'pos', VALUE_TAB)
    tabs[0].set(W + 'pos', LABEL_TAB)
    tabs.append(second)

    ind = pPr.find(W + 'ind')
    ind.set(W + 'left', IND_LEFT)
    ind.set(W + 'hanging', IND_HANGING)

    # last run holds ': {value}' — becomes three runs sharing the same rPr
    value_run = p.findall(W + 'r')[-1]
    value_run.find(W + 't').text = ':'
    tab_run = deepcopy(value_run)
    tab_run.remove(tab_run.find(W + 't'))
    tab_run.append(tab_run.makeelement(W + 'tab', {}))
    tag_run = deepcopy(value_run)
    tag_run.find(W + 't').text = tag  # whole tag, one w:t — docxtemplater needs it intact
    value_run.addnext(tag_run)
    value_run.addnext(tab_run)
    return True


def fix_signature(row):
    """D3 — give PIHAK PERTAMA the same two tag paragraphs PIHAK KEDUA has."""
    cells = row.findall(W + 'tc')
    left, right = cells[0], cells[-1]
    if left.find('.//' + W + 't') is not None:
        return False

    for p in left.findall(W + 'p'):
        left.remove(p)
    for src, tag in zip(right.findall(W + 'p'), ('{%ttd2}', '{%stempel2}')):
        p = deepcopy(src)
        p.attrib.pop(W14 + 'paraId', None)  # paraIds must stay unique
        p.find('.//' + W + 't').text = tag
        left.append(p)

    trPr = row.find(W + 'trPr')
    height = trPr.find(W + 'trHeight')
    if height is not None:
        trPr.remove(height)
    else:
        height = trPr.makeelement(W + 'trHeight', {})
    height.set(W + 'val', SIG_HEIGHT)
    height.set(W + 'hRule', 'atLeast')
    after = [c for c in trPr if TRPR_ORDER.index(c.tag) > TRPR_ORDER.index(W + 'trHeight')]
    if after:
        after[0].addprevious(height)
    else:
        trPr.append(height)
    return True


def main():
    src = zipfile.ZipFile(str(PATH))
    parts = {n: src.read(n) for n in src.namelist()}
    infos = src.infolist()
    src.close()

    header = etree.fromstring(parts['word/header1.xml'])
    doc = etree.fromstring(parts['word/document.xml'])
    body = doc.find(W + 'body')
    paras = body.findall(W + 'p')
    perangkat = next(p for p in paras if '{#items}' in ''.join(p.itertext()))
    jumlah = perangkat.getnext()
    sig_row = body.findall(W + 'tbl')[-1].findall(W + 'tr')[1]

    done = {
        'D1 logo posOffset': fix_logo(header),
        'D2 perangkat hanging': fix_hanging(perangkat, '{perangkat}'),
        'D2 jumlah hanging': fix_hanging(jumlah, '{jumlah}'),
        'D3 pihak pertama ttd': fix_signature(sig_row),
    }
    for name, changed in done.items():
        print(('  changed ' if changed else '  already ') + name)
    if not any(done.values()):
        print('nothing to do — BAST.docx already tidy')
        return

    parts['word/header1.xml'] = etree.tostring(header, xml_declaration=True,
                                               encoding='UTF-8', standalone=True)
    parts['word/document.xml'] = etree.tostring(doc, xml_declaration=True,
                                                encoding='UTF-8', standalone=True)
    tmp = PATH.with_suffix('.docx.tmp')
    with zipfile.ZipFile(str(tmp), 'w', zipfile.ZIP_DEFLATED) as out:
        for info in infos:  # keep every original entry, in order
            out.writestr(info.filename, parts[info.filename])
    shutil.move(str(tmp), str(PATH))
    print('wrote', PATH)


if __name__ == '__main__':
    main()
