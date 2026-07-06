import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

const exec = promisify(execFile);
const TPL_DIR = path.join(process.cwd(), 'templates', 'docx');

/** Fill a DOCX template (docxtemplater {tags}) with form data. */
export async function fillDocx(templateFile: string, data: Record<string, string>): Promise<Buffer> {
  const src = await fs.readFile(path.join(TPL_DIR, templateFile));
  const zip = new PizZip(src);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '', // missing fields render blank, never "undefined"
  });
  doc.render(data);
  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
}

/** Convert a DOCX buffer to PDF via LibreOffice headless. */
export async function docxToPdf(docx: Buffer): Promise<Buffer> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'iconform-'));
  try {
    const inPath = path.join(dir, 'doc.docx');
    await fs.writeFile(inPath, docx);
    // per-call HOME isolates the LibreOffice profile → parallel-safe
    await exec('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, inPath], {
      env: { ...process.env, HOME: dir },
      timeout: 60_000,
    });
    return await fs.readFile(path.join(dir, 'doc.pdf'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
