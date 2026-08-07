"""BAST: replace the broken Perangkat/Jumlah table with a repeatable
paragraph loop so a BAST can list many devices (image #6).

The master had a 4-column table with one Perangkat row + one Jumlah row; the
narrow value cell made "18 Unit" wrap one char per line. We drop the table
and emit docxtemplater loop paragraphs:

    {#items}Perangkat<tab>: {perangkat}
            Jumlah<tab>: {jumlah}
    {/items}                       <- blank line between groups

Indented (567 twips) to sit under numbered item 1, colon at a 2160 tab stop.
Idempotent: if {#items} already present, do nothing.
"""

from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import parse_xml

TPL = Path(__file__).parent.parent / "templates" / "docx"
NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

ARIAL = ('<w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" '
         'w:hAnsi="Arial"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:rtl w:val="0"/></w:rPr>')


def para(pieces, after="0"):
    """pieces: list of ('text', s) or ('tab', None). Returns a <w:p> element."""
    runs = ""
    for kind, s in pieces:
        if kind == 'tab':
            runs += f'<w:r>{ARIAL}<w:tab/></w:r>'
        else:
            esc = s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            runs += f'<w:r>{ARIAL}<w:t xml:space="preserve">{esc}</w:t></w:r>'
    pPr = (f'<w:pPr><w:tabs><w:tab w:val="left" w:pos="2160"/></w:tabs>'
           f'<w:spacing w:after="{after}" w:line="240" w:lineRule="auto"/>'
           f'<w:ind w:left="567"/></w:pPr>')
    return parse_xml(f'<w:p {NS}>{pPr}{runs}</w:p>')


def main():
    doc = Document(TPL / "BAST.docx")
    body = doc.element.body

    if '{#items}' in body.xml:
        print("BAST.docx: already has {#items} loop — skip")
        return

    # locate the table holding {perangkat}
    tbl = None
    for t in body.iter(qn('w:tbl')):
        if '{perangkat}' in t.xml:
            tbl = t
            break
    if tbl is None:
        print("BAST.docx: perangkat table not found — abort")
        return

    # 3-paragraph loop. {#items} opens P1, {/items} sits ALONE in P3 so
    # docxtemplater stays in paragraphLoop mode (a closing tag mid-paragraph
    # triggers inline mode and swallows the paragraph break -> rows merge).
    # The group gap comes from P2 (Jumlah) space-after, not the empty P3.
    new_paras = [
        para([('text', '{#items}Perangkat'), ('tab', None), ('text', ': {perangkat}')]),
        para([('text', 'Jumlah'), ('tab', None), ('text', ': {jumlah}')], after="160"),
        para([('text', '{/items}')]),
    ]
    for p in new_paras:
        tbl.addprevious(p)
    tbl.getparent().remove(tbl)

    doc.save(TPL / "BAST.docx")
    print("BAST.docx: perangkat table -> {#items} loop paragraphs")


if __name__ == '__main__':
    main()
