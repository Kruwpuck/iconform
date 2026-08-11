import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { prisma } from '@/server/infra/prisma';
import { parseDocumentInput, createDocument } from '@/server/services/documents';
import { FolderType, TemplateType } from '@prisma/client';

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

  const body = await req.json().catch(() => null);
  const parsed = parseDocumentInput(body, req.headers.get('content-length'));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const doc = await createDocument(parsed.input, { id: session.user?.id, name: session.user?.name });
  if (!doc) return NextResponse.json({ error: 'Drive folder ID not configured' }, { status: 500 });
  return NextResponse.json(doc, { status: 201 });
}
