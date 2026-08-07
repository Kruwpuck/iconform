"""BAKL: the Petugas Lapangan table has no cell margins, so text sits flush
against the left border. Add table cell margins (108 twips ~ Word default)
so every cell gets left/right padding. Idempotent.
"""

from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import parse_xml

TPL = Path(__file__).parent.parent / "templates" / "docx"
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

CELL_MAR = (
    f'<w:tblCellMar {NS}>'
    '<w:top w:w="15" w:type="dxa"/>'
    '<w:left w:w="144" w:type="dxa"/>'
    '<w:bottom w:w="15" w:type="dxa"/>'
    '<w:right w:w="144" w:type="dxa"/>'
    '</w:tblCellMar>'
)


def main():
    doc = Document(TPL / "BAKL.docx")
    changed = 0
    for tbl in doc.element.body.iter(qn('w:tbl')):
        if '{perusahaan}' not in tbl.xml and '{#petugas}' not in tbl.xml:
            continue
        tblPr = tbl.find(qn('w:tblPr'))
        if tblPr is None:
            continue
        old = tblPr.find(qn('w:tblCellMar'))
        if old is not None:
            tblPr.remove(old)
        # tblCellMar must precede tblLook in schema order, else LibreOffice
        # ignores it. Insert before tblLook (or append if absent).
        look = tblPr.find(qn('w:tblLook'))
        if look is not None:
            look.addprevious(parse_xml(CELL_MAR))
        else:
            tblPr.append(parse_xml(CELL_MAR))

        # Each cell also carries its own tcMar with left/right = 0, which
        # overrides the table-level margin. Bump those to 144 too.
        for tc in tbl.iter(qn('w:tc')):
            tcMar = tc.find(f'.//{qn("w:tcMar")}')
            if tcMar is None:
                continue
            for side in ('w:left', 'w:right'):
                m = tcMar.find(qn(side))
                if m is not None:
                    m.set(qn('w:w'), '144')
        changed += 1
    doc.save(TPL / "BAKL.docx")
    print(f"BAKL.docx: added cell margins to {changed} petugas table(s)")


if __name__ == '__main__':
    main()
