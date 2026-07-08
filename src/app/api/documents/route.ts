import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFile, deleteFile, prepareTargetFolder } from '@/lib/gdrive';
import { templateById } from '@/lib/templates';
import { generateDoc } from '@/lib/docxgen';
import { FolderType, TemplateType } from '@prisma/client';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search') ?? '';
  const folder = searchParams.get('folder') as FolderType | null;
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '10')));

  const where = {
    ...(folder && Object.values(FolderType).includes(folder) ? { folder } : {}),
    filename: { contains: search, mode: 'insensitive' as const },
  };

  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  const filename = (body.filename as string | undefined)?.trim();
  const template = body.template as string | undefined;
  const data = (body.data ?? {}) as Record<string, string>;
  const logo = body.logo as string | null | undefined;

  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });
  const def = template && Object.values(TemplateType).includes(template as TemplateType)
    ? templateById(template)
    : undefined;
  if (!def) return NextResponse.json({ error: 'invalid template' }, { status: 400 });

  const folderId = await prepareTargetFolder(def.id, def.folder, filename, logo);
  if (!folderId) return NextResponse.json({ error: 'Drive folder ID not configured' }, { status: 500 });

  // server-side generation from the original DOCX master — exact layout
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
        createdById: session.user?.id ?? '',
      },
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    // ponytail: cleanup Drive files if DB write fails — no orphaned Drive files
    await Promise.allSettled([deleteFile(pdf.id), deleteFile(docx.id)]);
    throw err;
  }
}
