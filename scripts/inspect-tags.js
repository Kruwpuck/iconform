const fs = require('fs');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

function printTags(file) {
  const content = fs.readFileSync(file, 'binary');
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  const text = doc.getFullText();
  const tags = text.match(/\{[^}]+\}/g);
  console.log(`\n--- ${file} ---`);
  if (tags) {
    console.log([...new Set(tags)].join('\n'));
  } else {
    console.log('No tags found or tags are split by XML. Text preview:');
    console.log(text.substring(0, 500));
  }
}

printTags('templates/docx/NODIN.docx');
printTags('templates/docx/BAST.docx');
