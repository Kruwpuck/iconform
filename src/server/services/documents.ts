import 'server-only';
import { prisma } from '@/server/infra/prisma';
import { uploadFile, deleteFile, prepareTargetFolder, getFileMeta } from '@/server/infra/gdrive';
import { generateDoc, fillDocx, parsePos, pdfToPngs } from '@/server/infra/docxgen';
import { logAction } from '@/server/infra/audit';
import { templateById, archiveDateOf, type TemplateDef } from '@/domain/templates';
import { sanitizeFilename, isValidLogo, MAX_BODY_BYTES } from '@/domain/validate';
import { TemplateType, type Document } from '@prisma/client';

export type Actor = { id?: string; name?: string | null };

export type ParsedInput = {
  filename: string;
  def: TemplateDef;
  data: Record<string, string>;
  logo: string | null | undefined;
};

export type ParseResult = { ok: true; input: ParsedInput } | { ok: false; error: string; status: number };

/** Validate a create/update request body. Shared by POST /api/documents and PUT /api/documents/[id]. */
export function parseDocumentInput(body: unknown, contentLength: string | null): ParseResult {
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES)
    return { ok: false, error: 'payload too large', status: 413 };
  if (!body || typeof body !== 'object') return { ok: false, error: 'invalid JSON', status: 400 };

  const b = body as Record<string, unknown>;
  const filename = sanitizeFilename((b.filename as string) ?? '');
  const template = b.template as string | undefined;
  const data = (b.data ?? {}) as Record<string, string>;
  const logo = b.logo as string | null | undefined;

  if (!filename) return { ok: false, error: 'filename required', status: 400 };
  const def = template && Object.values(TemplateType).includes(template as TemplateType)
    ? templateById(template)
    : undefined;
  if (!def) return { ok: false, error: 'invalid template', status: 400 };

  if (logo && !isValidLogo(logo)) return { ok: false, error: 'invalid logo', status: 400 };

  return { ok: true, input: { filename, def, data, logo } };
}

/** Render DOCX+PDF and upload both to the target Drive folder. Shared create/update step. */
export async function renderAndUpload(def: TemplateDef, filename: string, data: Record<string, string>, logo: string | null | undefined) {
  const folderId = await prepareTargetFolder(def.id, def.folder, filename, logo);
  if (!folderId) return null;

  if (logo) data.logoMitra = logo;
  const { docx: docxBuf, pdf: pdfBuf } = await generateDoc(def.file, data);

  const [pdf, docx] = await Promise.all([
    uploadFile(filename + '.pdf', 'application/pdf', pdfBuf, folderId),
    uploadFile(
      filename + '.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      docxBuf,
      folderId
    ),
  ]);
  return { pdf, docx };
}

export async function createDocument(input: ParsedInput, actor: Actor) {
  const { filename, def, data, logo } = input;
  const uploaded = await renderAndUpload(def, filename, data, logo);
  if (!uploaded) return null;
  const { pdf, docx } = uploaded;

  try {
    const doc = await prisma.document.create({
      data: {
        filename,
        folder: def.folder,
        template: def.id,
        contentHtml: JSON.stringify(data), // ponytail: reuse column for form data JSON
        logoBase64: logo ?? null,
        driveFileIdPdf: pdf.id,
        driveFileIdDocx: docx.id,
        webViewLinkPdf: pdf.webViewLink,
        webViewLinkDocx: docx.webViewLink,
        createdById: actor.id ?? '',
        // archive by the letter's own date, not when it was generated;
        // undefined falls through to @default(now())
        createdAt: archiveDateOf(def, data),
      },
    });
    await logAction('DOC_CREATE', filename, actor);
    return doc;
  } catch (err) {
    // ponytail: cleanup Drive files if DB write fails — no orphaned Drive files
    await Promise.allSettled([deleteFile(pdf.id), deleteFile(docx.id)]);
    throw err;
  }
}

export async function updateDocument(id: string, existing: Document, input: ParsedInput, actor: Actor) {
  const { filename, def, data, logo } = input;
  const uploaded = await renderAndUpload(def, filename, data, logo);
  if (!uploaded) return null;
  const { pdf, docx } = uploaded;

  const updated = await prisma.document.update({
    where: { id },
    data: {
      filename,
      folder: def.folder,
      template: def.id,
      contentHtml: JSON.stringify(data),
      logoBase64: logo ?? null,
      driveFileIdPdf: pdf.id,
      driveFileIdDocx: docx.id,
      webViewLinkPdf: pdf.webViewLink,
      webViewLinkDocx: docx.webViewLink,
      // changing the letter's date moves its archive date too
      createdAt: archiveDateOf(def, data),
    },
  });

  // ponytail: replace-not-version; delete old Drive files after successful DB update
  await Promise.allSettled([
    deleteFile(existing.driveFileIdPdf),
    deleteFile(existing.driveFileIdDocx),
  ]);

  await logAction('DOC_EDIT', filename, actor);
  return updated;
}

export async function deleteDocument(doc: Document, actor: Actor) {
  // BA Pengujian lives in its own per-doc folder — remove the whole folder
  // (doc + logo) when its name matches; otherwise fall back to per-file delete
  let folderDeleted = false;
  if (doc.template === 'BA_PENGUJIAN') {
    const meta = await getFileMeta(doc.driveFileIdPdf);
    const parentId = meta?.parents[0];
    if (parentId) {
      const parent = await getFileMeta(parentId);
      if (parent?.name === doc.filename) {
        await deleteFile(parentId);
        folderDeleted = true;
      }
    }
  }
  if (!folderDeleted) {
    await Promise.allSettled([
      deleteFile(doc.driveFileIdPdf),
      deleteFile(doc.driveFileIdDocx),
    ]);
  }

  await prisma.document.delete({ where: { id: doc.id } });
  await logAction('DOC_DELETE', doc.filename, actor);
}

type StoredDoc = Pick<Document, 'contentHtml' | 'logoBase64' | 'template'>;

/** Regenerate one half of the DOCX/PDF pair from stored form data; null if not possible. */
export async function rebuildDocument(doc: StoredDoc, type: 'pdf' | 'docx'): Promise<Buffer | null> {
  const def = templateById(doc.template);
  if (!def) return null;
  let data: Record<string, string>;
  try {
    const parsed = JSON.parse(doc.contentHtml);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    data = parsed as Record<string, string>;
  } catch {
    return null;
  }
  if (doc.logoBase64) data.logoMitra = doc.logoBase64;
  // DOCX skips generateDoc: its docx half is plain fillDocx, no LibreOffice run.
  if (type === 'docx') return fillDocx(def.file, data);
  return (await generateDoc(def.file, data)).pdf;
}

/** Render a live preview: either a single PDF, or per-page PNGs for the drag-to-position editor. */
export async function renderPreview(def: TemplateDef, data: Record<string, string>, asPages: boolean) {
  if (!asPages) return { pdf: (await generateDoc(def.file, data)).pdf };

  // Blank a mark only when it has a parseable position — same rule as
  // generateDoc. Positioned marks are drawn by the UI overlay; unpositioned
  // ones stay baked in at the template's inline spot, exactly where the
  // saved PDF puts them.
  const blanked: Record<string, string> = Object.fromEntries(
    (['ttd', 'stempel', 'ttd2', 'stempel2', 'logoMitra'] as const)
      .filter((k) => parsePos(data[k + 'Pos']))
      .map((k) => [k, ''])
  );
  const { pdf } = await generateDoc(def.file, { ...data, ...blanked });
  const pngs = await pdfToPngs(pdf);
  return { pages: pngs.map((b) => 'data:image/png;base64,' + b.toString('base64')) };
}
