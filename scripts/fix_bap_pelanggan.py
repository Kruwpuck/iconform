"""BAP: split the No Sales Order / Nama Pelanggan paragraph and give the
Nama Pelanggan row a hanging indent so a long customer name wraps back
under the value column instead of the cell's left margin.

The master packs both rows into ONE paragraph joined by <w:br/>. A hanging
indent on that combined paragraph would wrongly indent the Nama Pelanggan
label line too, so we split at the <w:br/> first. Idempotent.
"""

import copy
from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

TPL = Path(__file__).parent.parent / "templates" / "docx"
VALUE_COL = "2880"  # twips — matches the colon column (default tab stop)


def split_and_indent(doc):
    # spec block lives inside a table → iterate ALL <w:p>, not just body ones
    for el in list(doc.element.body.iter(qn('w:p'))):
        text = "".join(t.text or "" for t in el.iter(qn('w:t')))
        if '{noSalesOrder}' not in text or '{namaPelanggan}' not in text:
            continue

        run = el.find(qn('w:r'))
        br = run.find(qn('w:br')) if run is not None else None
        if br is None:
            _add_hanging(el)  # already split in a previous run
            return

        # Build the second paragraph: clone paragraph shell, keep run props,
        # move all run children AFTER the <w:br/> into it.
        p2 = copy.deepcopy(el)
        r1 = el.find(qn('w:r'))
        r2 = p2.find(qn('w:r'))

        kids1 = list(r1)
        kids2 = list(r2)
        bidx = kids1.index(r1.find(qn('w:br')))

        # r1 keeps children before the br (drop the br itself)
        for ch in kids1[bidx:]:
            r1.remove(ch)
        # r2 keeps children after the br (drop everything up to and incl. br),
        # but preserve the run's <w:rPr> or it loses its font (Arial 10pt).
        for ch in kids2[:bidx + 1]:
            if ch.tag != qn('w:rPr'):
                r2.remove(ch)

        _add_hanging(p2)
        el.addnext(p2)
        return


def _add_hanging(el):
    pPr = el.find(qn('w:pPr'))
    if pPr is None:
        pPr = OxmlElement('w:pPr')
        el.insert(0, pPr)
    old = pPr.find(qn('w:ind'))
    if old is not None:
        pPr.remove(old)
    ind = OxmlElement('w:ind')
    ind.set(qn('w:left'), VALUE_COL)
    ind.set(qn('w:hanging'), VALUE_COL)
    pPr.append(ind)


if __name__ == '__main__':
    doc = Document(TPL / "BAP.docx")
    split_and_indent(doc)
    doc.save(TPL / "BAP.docx")
    print("BAP.docx: Nama Pelanggan split + hanging indent")
