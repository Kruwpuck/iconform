import { NextResponse } from 'next/server';
import { auth } from '@/server/auth';
import { templateById } from '@/domain/templates';
import { renderPreview } from '@/server/services/documents';

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const template = body?.template as string | undefined;
  const data = (body?.data ?? {}) as Record<string, string>;
  const logo = body?.logo as string | null | undefined;

  const def = template ? templateById(template) : undefined;
  if (!def) return NextResponse.json({ error: 'invalid template' }, { status: 400 });

  if (logo) data.logoMitra = logo;

  const asPages = new URL(req.url).searchParams.get('format') === 'pages';
  const result = await renderPreview(def, data, asPages);

  if ('pages' in result) return NextResponse.json({ pages: result.pages });
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: { 'Content-Type': 'application/pdf' },
  });
}
