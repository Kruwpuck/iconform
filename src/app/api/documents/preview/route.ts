import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { templateById } from '@/lib/templates';
import { fillDocx, docxToPdf } from '@/lib/docxgen';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const template = body?.template as string | undefined;
  const data = (body?.data ?? {}) as Record<string, string>;

  const def = template ? templateById(template) : undefined;
  if (!def) return NextResponse.json({ error: 'invalid template' }, { status: 400 });

  const docx = await fillDocx(def.file, data);
  const pdf = await docxToPdf(docx);

  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf' },
  });
}
