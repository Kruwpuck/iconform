"""Fix BAI spacing — standardize tab stops untuk consistency."""

from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

TPL = Path(__file__).parent.parent / "templates" / "docx"

# BAI + UID_JABAR share the same spesifikasi layout
FILES = ["BAI.docx", "UID_JABAR.docx"]

def fix_file(name):
    doc = Document(TPL / name)

    for p in doc.paragraphs:
        text = "".join(r.text or "" for r in p.runs).strip()
        # match any data-field paragraph: has a tab+colon pattern
        if '\t:' not in text and ('\t' not in text or ':' not in text.split('\t', 1)[-1][:3]):
            continue

        # Get/create pPr
        pPr = p._element.find(qn('w:pPr'))
        if pPr is None:
            pPr = OxmlElement('w:pPr')
            p._element.insert(0, pPr)

        # Remove existing tabs
        existing_tabs = pPr.find(qn('w:tabs'))
        if existing_tabs is not None:
            pPr.remove(existing_tabs)

        # Remove hanging/left indent — hanging indent creates an implicit tab
        # stop at the left-indent position, so the label tab jumps there
        # instead of to our 2880 stop (misaligned colons).
        existing_ind = pPr.find(qn('w:ind'))
        if existing_ind is not None:
            pPr.remove(existing_ind)

        # Add uniform tab at 2880 twips (2 inch) — fits the longest label.
        # Rows with a second tab (e.g. "...: {value}\tSN: {sn}") get a second
        # stop at 5760 so the SN column lines up regardless of value length.
        n_tabs = sum(1 for r in p.runs for ch in r._r if ch.tag == qn('w:tab'))
        tabs = OxmlElement('w:tabs')
        for pos in (['2880', '5760'] if n_tabs >= 2 else ['2880']):
            tab = OxmlElement('w:tab')
            tab.set(qn('w:val'), 'left')
            tab.set(qn('w:pos'), pos)
            tabs.append(tab)
        pPr.append(tabs)

    doc.save(TPL / name)
    print(f"{name}: tab stops standardized to 2880 twips, hanging indents removed")

if __name__ == '__main__':
    for f in FILES:
        fix_file(f)
