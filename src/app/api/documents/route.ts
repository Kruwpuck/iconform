import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { uploadFile, deleteFile, prepareTargetFolder } from '@/lib/gdrive';
import { templateById, archiveDateOf } from '@/lib/templates';
import { generateDoc } from '@/lib/docxgen';
import { FolderType, TemplateType } from '@prisma/client';
import { sanitizeFilename, isValidLogo, MAX_BODY_BYTES } from '@/lib/validate';
import { logAction } from '@/lib/audit';

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);

  if (searchParams.get('distinctMonths') === '1') {
    const rows = await prisma.$queryRaw<{ month: string }[]>`
      SELECT DISTINCT to_char("createdAt", 'YYYY-MM') AS month
      FROM "Document"
      ORDER BY month DESC
    `;
    return NextResponse.json({ months: rows.map((r) => r.month) });
  }

  const search = searchParams.get('search') ?? '';
  const folder = searchParams.get('folder') as FolderType | null;
  const templateParam = searchParams.get('template') as TemplateType | null;
  const month = searchParams.get('month'); // "YYYY-MM" — filters by createdAt
  // sort: createdAt (tanggal) | filename (abjad); dir: asc | desc
  const sort = searchParams.get('sort') === 'filename' ? 'filename' : 'createdAt';
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') ?? '10')));

  let createdAtRange: { gte: Date; lt: Date } | undefined;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    createdAtRange = { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
  }

  const where = {
    ...(folder && Object.values(FolderType).includes(folder) ? { folder } : {}),
    ...(templateParam && Object.values(TemplateType).includes(templateParam) ? { template: templateParam } : {}),
    ...(createdAtRange ? { createdAt: createdAtRange } : {}),
    filename: { contains: search, mode: 'insensitive' as const },
  };

  const [items, total] = await Promise.all([
    prisma.document.findMany({
      where,
      orderBy: { [sort]: dir },
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
        // archive by the letter's own date, not when it was generated;
        // undefined falls through to @default(now())
        createdAt: archiveDateOf(def, data),
      },
    });
    await logAction('DOC_CREATE', filename, { id: session.user?.id, name: session.user?.name });
    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    // ponytail: cleanup Drive files if DB write fails — no orphaned Drive files
    await Promise.allSettled([deleteFile(pdf.id), deleteFile(docx.id)]);
    throw err;
  }
}
