import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFile, deleteFile } from '@/lib/storage';
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

  const [pdfBuf, docxBuf] = await Promise.all([
    pdfFile.arrayBuffer(),
    docxFile.arrayBuffer(),
  ]);

  const [pdf, docx] = await Promise.all([
    uploadFile(filename + '.pdf', 'application/pdf', Buffer.from(pdfBuf), ''),
    uploadFile(
      filename + '.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from(docxBuf),
      ''
    ),
  ]);

  try {
    const doc = await prisma.document.create({
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
