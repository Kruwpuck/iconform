"""Fix BAI spacing — standardize tab stops untuk consistency."""

from pathlib import Path
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

TPL = Path(__file__).parent.parent / "templates" / "docx"

def fix_bai_spacing():
    doc = Document(TPL / "BAI.docx")

    # Target paragraphs: "Nama Layanan : " through "Jarak OTDR : "
    # Set uniform tab stop di 1800 twips (1.25 inch) — lebih short
    target_labels = {
        'Nama Layanan', 'Service ID', 'Interface', 'Bandwidth',
        'Originating', 'Terminating', 'No PA',
        'Nama Pelanggan',
        'Nama Perangkat', 'Alamat/Lokasi POP', 'Koordinat POP',
        'Nama Perangkat POP', 'Kanal/Port', 'Jarak OTDR',
        'Nama', 'Jabatan', 'Alamat Kantor'
    }

    for p in doc.paragraphs:
        text = "".join(r.text or "" for r in p.runs).strip()
        label = text.split('\t')[0].split(':')[0].strip() if text else ""

        if label not in target_labels:
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

        # Add new tab at 1800 twips (consistent)
        tabs = OxmlElement('w:tabs')
        tab = OxmlElement('w:tab')
        tab.set(qn('w:val'), 'left')
        tab.set(qn('w:pos'), '1800')
        tabs.append(tab)
        pPr.append(tabs)

    doc.save(TPL / "BAI.docx")
    print("BAI: tab stops standardized to 1800 twips")

if __name__ == '__main__':
    fix_bai_spacing()
