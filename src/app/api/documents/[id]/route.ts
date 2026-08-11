import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { prisma } from '@/server/infra/prisma';
import { parseDocumentInput, updateDocument, deleteDocument } from '@/server/services/documents';

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
  const parsed = parseDocumentInput(body, req.headers.get('content-length'));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });

  const updated = await updateDocument(id, existing, parsed.input, { id: session.user?.id, name: session.user?.name });
  if (!updated) return NextResponse.json({ error: 'Drive folder ID not configured' }, { status: 500 });
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

  await deleteDocument(doc, { id: session.user?.id, name: session.user?.name });
  return new NextResponse(null, { status: 204 });
}
