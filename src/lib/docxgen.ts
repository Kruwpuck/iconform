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
export function parsePos(s: string | undefined): { page: number; x: number; y: number } | null {
  const m = /^(\d+),([\d.]+),([\d.]+)$/.exec(s ?? '');
  return m ? { page: +m[1], x: +m[2], y: +m[3] } : null;
}

// = SIGNATURE_HEIGHT_PX at 96 dpi. The editor preview sizes its overlay marks
// from MARK_HEIGHT_PCT in lib/templates.ts (= this / A4 height) — change both.
const MARK_HEIGHT_PT = 33.75;

/** Every draggable mark tag. Order fixes the z-order of stacked marks. */
const MARK_KEYS = ['ttd', 'stempel', 'ttd2', 'stempel2', 'logoMitra'] as const;

const EMU_PER_PT = 12700;
const EMU_PER_TWIP = 635; // 1 twip = 1/20 pt

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

const NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/**
 * A page-anchored floating picture. `allowOverlap="1"` + `<wp:wrapNone/>` is
 * what lets marks sit on top of each other and on top of text, exactly like
 * the pdf-lib stamp does. `layoutInCell="0"` keeps the offsets relative to the
 * page even when the host paragraph lives inside a table cell.
 * All namespaces are declared inline — most templates have no drawings, so the
 * document root can't be relied on to declare wp/a/pic/r.
 */
function anchorXml(o: {
  relId: string;
  id: number;
  name: string;
  xEmu: number;
  yEmu: number;
  wEmu: number;
  hEmu: number;
}): string {
  return (
    `<w:r><w:drawing>` +
    `<wp:anchor xmlns:wp="${NS_WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0"` +
    ` relativeHeight="${251658240 + o.id}" behindDoc="0" locked="0" layoutInCell="0" allowOverlap="1">` +
    `<wp:simplePos x="0" y="0"/>` +
    `<wp:positionH relativeFrom="page"><wp:posOffset>${o.xEmu}</wp:posOffset></wp:positionH>` +
    `<wp:positionV relativeFrom="page"><wp:posOffset>${o.yEmu}</wp:posOffset></wp:positionV>` +
    `<wp:extent cx="${o.wEmu}" cy="${o.hEmu}"/>` +
    `<wp:effectExtent l="0" t="0" r="0" b="0"/>` +
    `<wp:wrapNone/>` +
    `<wp:docPr id="${o.id}" name="${o.name}"/>` +
    `<wp:cNvGraphicFramePr/>` +
    `<a:graphic xmlns:a="${NS_A}"><a:graphicData uri="${NS_PIC}">` +
    `<pic:pic xmlns:pic="${NS_PIC}">` +
    `<pic:nvPicPr><pic:cNvPr id="0" name="${o.name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip xmlns:r="${NS_R}" r:embed="${o.relId}"/>` +
    `<a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${o.wEmu}" cy="${o.hEmu}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>` +
    `</wp:anchor>` +
    `</w:drawing></w:r>`
  );
}

/** Page size in EMU, read from the section's `w:pgSz` (twips); A4 fallback. */
function pageSizeEmu(xml: string): { w: number; h: number } {
  const tag = /<w:pgSz\b[^>]*>/.exec(xml)?.[0] ?? '';
  const w = /\bw:w="(\d+)"/.exec(tag)?.[1];
  const h = /\bw:h="(\d+)"/.exec(tag)?.[1];
  return w && h
    ? { w: +w * EMU_PER_TWIP, h: +h * EMU_PER_TWIP }
    : { w: Math.round(595.276 * EMU_PER_PT), h: Math.round(841.89 * EMU_PER_PT) }; // A4
}

/**
 * Insert dragged marks into a rendered DOCX as page-anchored floating images,
 * so Word shows them at the same spot (and with the same overlap) as the
 * pdf-lib–stamped PDF. Expects a DOCX whose *inline* copies of these marks
 * were already blanked, otherwise each mark renders twice.
 */
function anchorMarks(docx: Buffer, data: Record<string, string>): Buffer {
  const marks = MARK_KEYS
    .map((k) => ({
      key: k,
      img: data[k],
      pos: parsePos(data[k + 'Pos']),
      scale: parseFloat(data[k + 'Size'] || '1') || 1,
    }))
    .filter((m) => m.img && m.pos);
  if (!marks.length) return docx;

  const zip = new PizZip(docx);
  const docEntry = zip.file('word/document.xml');
  const relsEntry = zip.file('word/_rels/document.xml.rels');
  const typesEntry = zip.file('[Content_Types].xml');
  if (!docEntry || !relsEntry || !typesEntry) return docx;

  let xml = docEntry.asText();
  let rels = relsEntry.asText();
  let types = typesEntry.asText();
  const page = pageSizeEmu(xml);

  // keep new ids clear of whatever the template already uses
  let nextRel = Math.max(0, ...[...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1])) + 1;
  let nextDocPr = Math.max(0, ...[...xml.matchAll(/<wp:docPr\s+id="(\d+)"/g)].map((m) => +m[1])) + 1;

  const extensions = new Set<string>();
  const runsByPage = new Map<number, string[]>();

  for (const { key, img, pos, scale } of marks) {
    const m = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(img!);
    if (!m) continue;
    const ext = m[1] === 'jpg' ? 'jpeg' : m[1];
    const bytes = Buffer.from(m[2], 'base64');

    let ratio = 1;
    try {
      const { width = 1, height = 1 } = imageSize(bytes);
      ratio = width / height;
    } catch {
      continue; // undecodable image — the PDF stamp skips it too
    }

    const hEmu = Math.round(MARK_HEIGHT_PT * scale * EMU_PER_PT);
    const wEmu = Math.round(hEmu * ratio);
    // pdf-lib places the image's top edge at pos.y * pageHeight from the top;
    // wp:positionV posOffset is measured from the page top as well.
    const xEmu = Math.round(pos!.x * page.w);
    const yEmu = Math.round(pos!.y * page.h);

    const relId = `rId${nextRel++}`;
    const target = `media/mark-${key}.${ext}`;
    zip.file(`word/${target}`, bytes);
    rels = rels.replace(
      '</Relationships>',
      `<Relationship Id="${relId}" Type="${NS_R}/image" Target="${target}"/></Relationships>`
    );
    extensions.add(ext);

    const runs = runsByPage.get(pos!.page) ?? [];
    runs.push(anchorXml({ relId, id: nextDocPr++, name: `mark-${key}`, xEmu, yEmu, wEmu, hEmu }));
    runsByPage.set(pos!.page, runs);
  }

  for (const ext of extensions) {
    if (!new RegExp(`<Default[^>]*Extension="${ext}"`, 'i').test(types)) {
      types = types.replace('<Default', `<Default Extension="${ext}" ContentType="image/${ext}"/><Default`);
    }
  }

  // An anchored run adds no line height, so hosting it in an existing paragraph
  // keeps the layout (and page count) untouched. A page-anchored drawing renders
  // on whichever page its host paragraph falls on: first paragraph for page 1,
  // last for anything beyond.
  // ponytail: exact host for page >2 needs real layout info — every template is
  // 1-2 pages with the marks on the last one, so first/last covers it.
  for (const [pageNum, runs] of runsByPage) {
    const at = pageNum <= 1 ? xml.indexOf('</w:p>') : xml.lastIndexOf('</w:p>');
    if (at < 0) continue;
    xml = xml.slice(0, at) + runs.join('') + xml.slice(at);
  }

  zip.file('word/document.xml', xml);
  zip.file('word/_rels/document.xml.rels', rels);
  zip.file('[Content_Types].xml', types);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
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
  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer;
}

/**
 * DOCX + PDF pair, both showing dragged marks at the same spot.
 *
 * Dragged marks are dropped from the rendered body (an inline image can't move
 * and can't overlap), then re-added per format at the preview position: as
 * page-anchored floating pictures in the DOCX, and as a pdf-lib stamp in the
 * PDF. Two renderers are unavoidable because LibreOffice drops floating
 * anchors on DOCX→PDF, but both consume the same fractional coordinates and
 * the same MARK_HEIGHT_PT, so the outputs line up.
 * Marks that were never dragged stay inline at the template's own spot.
 */
export async function generateDoc(
  templateFile: string,
  data: Record<string, string>
): Promise<{ docx: Buffer; pdf: Buffer }> {
  const dragged = MARK_KEYS.filter((k) => data[k] && parsePos(data[k + 'Pos']));
  if (!dragged.length) {
    const plain = await fillDocx(templateFile, data);
    return { docx: plain, pdf: await docxToPdf(plain) };
  }
  const base = await fillDocx(templateFile, {
    ...data,
    ...Object.fromEntries(dragged.map((k) => [k, ''])),
  });
  const pdf = await stampSignatures(await docxToPdf(base), data);
  return { docx: anchorMarks(base, data), pdf };
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
