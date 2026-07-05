import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFile, deleteFile } from '@/lib/gdrive';
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

  const form = await req.formData();
  const filename = (form.get('filename') as string | null)?.trim();
  const folder = form.get('folder') as string | null;
  const template = form.get('template') as string | null;
  const contentHtml = form.get('contentHtml') as string | null;
  const logoBase64 = form.get('logoBase64') as string | null;
  const pdfFile = form.get('pdf') as File | null;
  const docxFile = form.get('docx') as File | null;

  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
  if (!folder || !Object.values(FolderType).includes(folder as FolderType))
    return NextResponse.json({ error: 'invalid folder' }, { status: 400 });
  if (!template || !Object.values(TemplateType).includes(template as TemplateType))
    return NextResponse.json({ error: 'invalid template' }, { status: 400 });
  if (!contentHtml) return NextResponse.json({ error: 'contentHtml required' }, { status: 400 });
  if (!pdfFile || !docxFile) return NextResponse.json({ error: 'pdf and docx files required' }, { status: 400 });

  const folderId = FOLDER_IDS[folder as FolderType];
  if (!folderId) return NextResponse.json({ error: 'Drive folder ID not configured' }, { status: 500 });

  const [pdfBuf, docxBuf] = await Promise.all([
    pdfFile.arrayBuffer(),
    docxFile.arrayBuffer(),
  ]);

  const [pdf, docx] = await Promise.all([
    uploadFile(filename + '.pdf', 'application/pdf', Buffer.from(pdfBuf), folderId),
    uploadFile(
      filename + '.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from(docxBuf),
      folderId
    ),
  ]);

  const updated = await prisma.document.update({
    where: { id },
    data: {
      filename,
      folder: folder as FolderType,
      template: template as TemplateType,
      contentHtml,
      logoBase64,
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
