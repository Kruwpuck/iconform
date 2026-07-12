import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import { imageSize } from 'image-size';
import { PDFDocument } from 'pdf-lib';

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

/** "page,x,y" (x/y = fractions of the page) set by dragging in the editor preview. */
function parsePos(s: string | undefined): { page: number; x: number; y: number } | null {
  const m = /^(\d+),([\d.]+),([\d.]+)$/.exec(s ?? '');
  return m ? { page: +m[1], x: +m[2], y: +m[3] } : null;
}

const MARK_HEIGHT_PT = 33.75; // = SIGNATURE_HEIGHT_PX at 96 dpi

/** Stamp dragged ttd/stempel onto the PDF at their preview positions. */
async function stampSignatures(pdf: Buffer, data: Record<string, string>): Promise<Buffer> {
  const marks = (['ttd', 'stempel'] as const)
    .map((k) => ({ img: data[k], pos: parsePos(data[k + 'Pos']), scale: parseFloat(data[k + 'Size'] || '1') }))
    .filter((m) => m.img && m.pos);
  if (!marks.length) return pdf;
  const doc = await PDFDocument.load(pdf);
  for (const { img, pos, scale } of marks) {
    const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(img!);
    if (!m) continue;
    const bytes = Buffer.from(m[2], 'base64');
    const embedded = m[1] === 'png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const page = doc.getPage(Math.min(pos!.page, doc.getPageCount()) - 1);
    const h = MARK_HEIGHT_PT * scale;
    page.drawImage(embedded, {
      x: pos!.x * page.getWidth(),
      y: page.getHeight() - pos!.y * page.getHeight() - h,
      width: (embedded.width / embedded.height) * h,
      height: h,
    });
  }
  return Buffer.from(await doc.save());
}

/** Fill a DOCX template (docxtemplater {tags}, {%image} tags) with form data. */
export async function fillDocx(templateFile: string, data: Record<string, string>): Promise<Buffer> {
  const src = await fs.readFile(path.join(TPL_DIR, templateFile));
  const zip = new PizZip(src);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [imageModule()],
    nullGetter: () => '',
  });
  // NODIN: assemble items array from flat material1..5 fields for {#items} loop
  const renderData: Record<string, unknown> = { ...data };
  if ('material1' in data) {
    renderData.items = Array.from({ length: 5 }, (_, i) => ({
      material: data[`material${i + 1}`] || '',
      vol: data[`vol${i + 1}`] || '',
      satuan: data[`satuan${i + 1}`] || '',
      hargaSatuan: data[`hargaSatuan${i + 1}`] || '',
      jumlahTotal: data[`jumlahTotal${i + 1}`] || '',
    })).filter((row) => row.material);
  }
  doc.render(renderData);
  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
}

/**
 * DOCX + PDF pair. The DOCX keeps inline marks at the template's signature
 * spot; dragged marks are stamped onto the PDF at their exact preview
 * position (LibreOffice drops floating anchors, so the PDF is stamped with
 * pdf-lib instead — the Drive DOCX shows marks at the default spot only).
 */
export async function generateDoc(
  templateFile: string,
  data: Record<string, string>
): Promise<{ docx: Buffer; pdf: Buffer }> {
  const docx = await fillDocx(templateFile, data);
  const dragged = (['ttd', 'stempel'] as const).filter((k) => data[k] && parsePos(data[k + 'Pos']));
  // dragged marks would appear twice in the PDF — blank their inline copy first
  const pdfSrc = dragged.length
    ? await fillDocx(templateFile, { ...data, ...Object.fromEntries(dragged.map((k) => [k, ''])) })
    : docx;
  const pdf = await stampSignatures(await docxToPdf(pdfSrc), data);
  return { docx, pdf };
}

/** Render PDF pages to PNG (96 dpi) via pdftoppm for the draggable preview. */
export async function pdfToPngs(pdf: Buffer): Promise<Buffer[]> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'iconform-'));
  try {
    const inPath = path.join(dir, 'doc.pdf');
    await fs.writeFile(inPath, pdf);
    await exec('pdftoppm', ['-png', '-r', '96', inPath, path.join(dir, 'pg')], { timeout: 60_000 });
    // ponytail: lexicographic sort — fine below 10 pages, all templates are 1-3
    const files = (await fs.readdir(dir)).filter((f) => f.startsWith('pg') && f.endsWith('.png')).sort();
    return Promise.all(files.map((f) => fs.readFile(path.join(dir, f))));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
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
