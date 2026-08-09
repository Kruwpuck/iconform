import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFile, deleteFile, prepareTargetFolder, getFileMeta } from '@/lib/gdrive';
import { templateById, archiveDateOf } from '@/lib/templates';
import { generateDoc } from '@/lib/docxgen';
import { TemplateType } from '@prisma/client';
import { sanitizeFilename, isValidLogo, MAX_BODY_BYTES } from '@/lib/validate';
import { logAction } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.document.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.createdById !== session.user?.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const contentLength = req.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES)
    return NextResponse.json({ error: 'payload too large' }, { status: 413 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  const filename = sanitizeFilename(body.filename ?? '');
  const template = body.template as string | undefined;
  const data = (body.data ?? {}) as Record<string, string>;
  const logo = body.logo as string | null | undefined;

  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
  const def = template && Object.values(TemplateType).includes(template as TemplateType)
    ? templateById(template)
    : undefined;
  if (!def) return NextResponse.json({ error: 'invalid template' }, { status: 400 });

  if (logo && !isValidLogo(logo))
    return NextResponse.json({ error: 'invalid logo' }, { status: 400 });

  // ponytail: renaming a BA Pengujian leaves the old (now empty) per-doc
  // folder behind; clean up manually if it bothers anyone
  const folderId = await prepareTargetFolder(def.id, def.folder, filename, logo);
  if (!folderId) return NextResponse.json({ error: 'Drive folder ID not configured' }, { status: 500 });

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

  await logAction('DOC_EDIT', filename, { id: session.user?.id, name: session.user?.name });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.createdById !== session.user?.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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

  await prisma.document.delete({ where: { id } });
  await logAction('DOC_DELETE', doc.filename, { id: session.user?.id, name: session.user?.name });
  return new NextResponse(null, { status: 204 });
}
