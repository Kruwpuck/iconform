import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFile, deleteFile } from '@/lib/gdrive';
import { templateById } from '@/lib/templates';
import { fillDocx, docxToPdf } from '@/lib/docxgen';
import { FolderType, TemplateType } from '@prisma/client';

const FOLDER_IDS: Record<FolderType, string | undefined> = {
  SURAT_TUGAS: process.env.GDRIVE_FOLDER_SURAT_TUGAS_ID,
  BERITA_ACARA: process.env.GDRIVE_FOLDER_BERITA_ACARA_ID,
};

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

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  const filename = (body.filename as string | undefined)?.trim();
  const template = body.template as string | undefined;
  const data = (body.data ?? {}) as Record<string, string>;

  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
  const def = template && Object.values(TemplateType).includes(template as TemplateType)
    ? templateById(template)
    : undefined;
  if (!def) return NextResponse.json({ error: 'invalid template' }, { status: 400 });

  const folderId = FOLDER_IDS[def.folder];
  if (!folderId) return NextResponse.json({ error: 'Drive folder ID not configured' }, { status: 500 });

  const docxBuf = await fillDocx(def.file, data);
  const pdfBuf = await docxToPdf(docxBuf);

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
      driveFileIdPdf: pdf.id,
      driveFileIdDocx: docx.id,
      webViewLinkPdf: pdf.webViewLink,
      webViewLinkDocx: docx.webViewLink,
    },
  });

  // ponytail: replace-not-version; delete old Drive files after successful DB update
  await Promise.allSettled([
    deleteFile(existing.driveFileIdPdf),
    deleteFile(existing.driveFileIdDocx),
  ]);

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

  await Promise.allSettled([
    deleteFile(doc.driveFileIdPdf),
    deleteFile(doc.driveFileIdDocx),
  ]);

  await prisma.document.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
