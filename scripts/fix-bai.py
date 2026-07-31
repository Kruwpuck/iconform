import zipfile
import xml.etree.ElementTree as ET
import os

BAI_PATH = "templates/docx/BAI.docx"

# Read the zip
with zipfile.ZipFile(BAI_PATH, 'r') as zin:
    xml_content = zin.read('word/document.xml')

# Register namespaces so ET doesn't mess them up
namespaces = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'w14': 'http://schemas.microsoft.com/office/word/2010/wordml',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}
for prefix, uri in namespaces.items():
    ET.register_namespace(prefix, uri)

root = ET.fromstring(xml_content)

# Fix 1: Change tab positions 1800 and 2127 to 2880
for tab in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tab'):
    if tab.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pos') in ['1800', '2127']:
        tab.set('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}pos', '2880')

# Fix 2: Add space after "layanan"
for t in root.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t'):
    if t.text and 'aktivasi layanan{namaLayanan}' in t.text:
        t.text = t.text.replace('aktivasi layanan{namaLayanan}', 'aktivasi layanan {namaLayanan}')

# Fix 3: Remove the duplicate Terminating paragraph
body = root.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}body')
found_terminating = False
to_remove = None

for p in body.findall('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p'):
    # Check if this paragraph has the text "Terminating"
    p_text = ''.join(t.text for t in p.iter('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t') if t.text)
    if 'Terminating' in p_text and '{terminating}' in p_text:
        if found_terminating:
            to_remove = p
            break
        else:
            found_terminating = True

if to_remove is not None:
    body.remove(to_remove)

# Write back to XML
new_xml = ET.tostring(root, encoding='utf-8', xml_declaration=True)

# Update the zip file
# ZipFile doesn't support updating an existing file easily, so we write to a new zip
import shutil
temp_zip = "templates/docx/BAI_new.docx"
with zipfile.ZipFile(BAI_PATH, 'r') as zin, zipfile.ZipFile(temp_zip, 'w') as zout:
    for item in zin.infolist():
        if item.filename == 'word/document.xml':
            zout.writestr(item, new_xml)
        else:
            zout.writestr(item, zin.read(item.filename))

os.replace(temp_zip, BAI_PATH)
print("Updated BAI.docx successfully.")
