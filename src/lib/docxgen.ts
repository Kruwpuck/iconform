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
      // A blank mark still reserves the full mark height: the PDF/preview path
      // blanks the dragged marks out of the body, and a 1x1 image collapses the
      // signature paragraph so the name rides up under the stamped mark.
      if (img.equals(BLANK_PNG)) return [1, SIGNATURE_HEIGHT_PX];
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
export function parsePos(s: string | undefined): { page: number; x: number; y: number } | null {
  const m = /^(\d+),([\d.]+),([\d.]+)$/.exec(s ?? '');
  return m ? { page: +m[1], x: +m[2], y: +m[3] } : null;
}

// = SIGNATURE_HEIGHT_PX at 96 dpi. The editor preview sizes its overlay marks
// from MARK_HEIGHT_PCT in lib/templates.ts (= this / A4 height) — change both.
const MARK_HEIGHT_PT = 33.75;

/** Every draggable mark tag. Order fixes the z-order of stacked marks. */
const MARK_KEYS = ['ttd', 'stempel', 'ttd2', 'stempel2', 'logoMitra'] as const;

/** Printed in place of any field the user left blank. */
const EMPTY_FILL = '......................';

/** Keys that must stay empty: image payloads and the drag metadata beside them. */
function isMetaKey(k: string): boolean {
  return k.startsWith('_') || /(?:Pos|Size)$/.test(k) || (MARK_KEYS as readonly string[]).includes(k);
}

/** Replace blank values with a dotted line, in place, recursing into loop rows. */
function fillBlanks(obj: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(obj)) {
    if (isMetaKey(k)) continue;
    if (v === '' || v == null) obj[k] = EMPTY_FILL;
    else if (Array.isArray(v)) {
      for (const row of v) if (row && typeof row === 'object') fillBlanks(row as Record<string, unknown>);
    }
  }
}

/** Stamp dragged ttd/stempel onto the PDF at their preview positions. */
async function stampSignatures(pdf: Buffer, data: Record<string, string>): Promise<Buffer> {
  const marks = MARK_KEYS
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

const WP_NS = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';

/**
 * Declare the wordprocessingDrawing namespace on the root when a drawing needs
 * it. The image module emits wp:-prefixed elements without declaring the prefix,
 * so inserting a mark into a template that has no drawing of its own (BAI, BAP)
 * produced malformed XML: LibreOffice guessed at it, Word refused the file.
 */
function ensureWpNs(xml: string): string {
  if (!xml.includes('<wp:') || xml.includes(`xmlns:wp="${WP_NS}"`)) return xml;
  return xml.replace(/<w:document\b/, `<w:document xmlns:wp="${WP_NS}"`);
}

/**
 * Turn the image module's inline drawings into floating "in front of text"
 * anchors (wrapNone + behindDoc=0), which is the layout the user wants for
 * every uploaded mark. Safe to run blind: the templates themselves ship zero
 * <wp:inline> drawings, so every one in the rendered XML is a module mark.
 *
 * Marks in the same paragraph keep their left-to-right order by offsetting each
 * one past the previous width — with no gap, so ttd and stempel sit joined.
 */
function floatMarks(xml: string): string {
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
    let xOffset = 0;
    return para.replace(/<wp:inline\b([^>]*)>([\s\S]*?)<\/wp:inline>/g, (whole, attrs: string, inner: string) => {
      // wrapNone has a fixed slot before wp:docPr; without it we can't build a
      // schema-valid anchor, so leave the drawing inline.
      if (!inner.includes('<wp:docPr')) return whole;
      const cx = Number(/<wp:extent[^>]*\bcx="(\d+)"/.exec(inner)?.[1] ?? 0);
      const off = xOffset;
      xOffset += cx;
      const pos =
        '<wp:simplePos x="0" y="0"/>' +
        `<wp:positionH relativeFrom="column"><wp:posOffset>${off}</wp:posOffset></wp:positionH>` +
        '<wp:positionV relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV>';
      const body = inner.replace('<wp:docPr', '<wp:wrapNone/><wp:docPr');
      return (
        `<wp:anchor${attrs} simplePos="0" relativeHeight="251658240" behindDoc="0"` +
        ` locked="0" layoutInCell="1" allowOverlap="1">${pos}${body}</wp:anchor>`
      );
    });
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
    // a tag the form never sent; image tags must stay empty so the module
    // falls back to BLANK_PNG instead of trying to decode the dots
    nullGetter: (part: { module?: string }) => (part?.module ? '' : EMPTY_FILL),
  });
  const renderData: Record<string, unknown> = { ...data };
  // Decode _group_* JSON arrays → docxtemplater loop arrays
  for (const [key, val] of Object.entries(data)) {
    if (key.startsWith('_group_')) {
      const gName = key.slice(7);
      try { renderData[gName] = JSON.parse(val); } catch { renderData[gName] = []; }
    }
  }
  // Legacy NODIN compat: flat material1..5 fields → items array
  if ('material1' in data && !('_group_items' in data)) {
    renderData.items = Array.from({ length: 5 }, (_, i) => ({
      material: data[`material${i + 1}`] || '',
      vol: data[`vol${i + 1}`] || '',
      satuan: data[`satuan${i + 1}`] || '',
      hargaSatuan: data[`hargaSatuan${i + 1}`] || '',
      jumlahTotal: data[`jumlahTotal${i + 1}`] || '',
    })).filter((row) => row.material);
  }
  // Legacy BAKL: kendala1/2/3 → kendala array
  if ('kendala1' in data && !('_group_kendala' in data)) {
    renderData.kendala = [1, 2, 3].map(i => ({ kendala: data[`kendala${i}`] || '' })).filter(r => r.kendala);
  }
  // Legacy SURAT_TUGAS: nama1/2/3 → petugas array
  if ('nama1' in data && !('_group_petugas' in data)) {
    renderData.petugas = [1, 2, 3].map(i => ({ nama: data[`nama${i}`] || '' })).filter(r => r.nama);
  }
  // SURAT_TUGAS prints its petugas as one hanging-indented block on the "Nama :"
  // line instead of a paragraph loop, so every name lines up under the first.
  if (Array.isArray(renderData.petugas)) {
    renderData.daftarPetugas = (renderData.petugas as { nama?: string }[])
      .map((p) => String(p.nama ?? '').trim())
      .filter(Boolean)
      .map((n) => `- Sdr. ${n}`)
      .join('\n'); // linebreaks:true turns these into <w:br/>
  }
  fillBlanks(renderData);
  doc.render(renderData);
  const out = doc.getZip();
  const body = out.file('word/document.xml');
  if (body) out.file('word/document.xml', ensureWpNs(floatMarks(body.asText())));
  return out.generate({ type: 'nodebuffer' }) as Buffer;
}

/**
 * DOCX + PDF pair.
 *
 * The DOCX always keeps its marks inline, in the template's own signature cell.
 * The dragged position is deliberately ignored there: it is a fraction of the
 * page measured against the LibreOffice-rendered preview, and Word lays the
 * same body out more tightly — on BA Pengujian the signature block sits ~50pt
 * higher in Word, so an absolutely positioned mark drifts well below the names.
 * An inline mark follows the names in whichever renderer opens the file.
 *
 * The PDF is the one that honours the drag: marks are blanked from the body
 * (an inline image can't move or overlap) and stamped back on by pdf-lib at the
 * preview coordinates, which is exactly what the editor overlay shows.
 */
export async function generateDoc(
  templateFile: string,
  data: Record<string, string>
): Promise<{ docx: Buffer; pdf: Buffer }> {
  const docx = await fillDocx(templateFile, data);
  const dragged = MARK_KEYS.filter((k) => data[k] && parsePos(data[k + 'Pos']));
  if (!dragged.length) return { docx, pdf: await docxToPdf(docx) };

  const blanked = await fillDocx(templateFile, {
    ...data,
    ...Object.fromEntries(dragged.map((k) => [k, ''])),
  });
  return { docx, pdf: await stampSignatures(await docxToPdf(blanked), data) };
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
