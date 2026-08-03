import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { templateById } from '@/lib/templates';
import { generateDoc, pdfToPngs } from '@/lib/docxgen';

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

  // format=pages → PNG per page for the drag-to-position preview
  // blank images so the PDF has no marks baked in; UI overlay renders them
  if (new URL(req.url).searchParams.get('format') === 'pages') {
    // blank marks so the overlay renders them; only blank the logo when it's
    // been positioned (has a Pos), else keep the fixed header logo baked-in
    const blankLogo: Record<string, string> = data.logoMitraPos ? { logoMitra: '' } : {};
    const { pdf } = await generateDoc(def.file, { ...data, ttd: '', stempel: '', ttd2: '', stempel2: '', ...blankLogo });
    const pngs = await pdfToPngs(pdf);
    return NextResponse.json({
      pages: pngs.map((b) => 'data:image/png;base64,' + b.toString('base64')),
    });
  }

  const { pdf } = await generateDoc(def.file, data);

  return new NextResponse(new Uint8Array(pdf), {
    headers: { 'Content-Type': 'application/pdf' },
  });
}
