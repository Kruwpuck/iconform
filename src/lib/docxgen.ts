import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import { imageSize } from 'image-size';

const exec = promisify(execFile);
const TPL_DIR = path.join(process.cwd(), 'templates', 'docx');

// 1x1 transparent PNG — rendered when a {%tag} has no uploaded image
const BLANK_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
// ponytail: one height for ttd + stempel; fits the tightest master (BAST) —
// tune per-tag if a template ever needs bigger marks
const SIGNATURE_HEIGHT_PX = 45;

function imageModule() {
  return new ImageModule({
    centered: false,
    getImage: (v: string | undefined) => {
      const m = /^data:image\/[\w+.-]+;base64,(.+)$/.exec(v ?? '');
      return m ? Buffer.from(m[1], 'base64') : BLANK_PNG;
    },
    getSize: (img: Buffer) => {
      if (img.equals(BLANK_PNG)) return [1, 1];
      try {
        const { width = 1, height = 1 } = imageSize(img);
        return [Math.round((width * SIGNATURE_HEIGHT_PX) / height), SIGNATURE_HEIGHT_PX];
      } catch {
        return [1, 1];
      }
    },
  });
}

/** Fill a DOCX template (docxtemplater {tags}, {%image} tags) with form data. */
export async function fillDocx(templateFile: string, data: Record<string, string>): Promise<Buffer> {
  const src = await fs.readFile(path.join(TPL_DIR, templateFile));
  const zip = new PizZip(src);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule()],
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
