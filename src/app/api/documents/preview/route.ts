import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { templateById } from '@/lib/templates';
import { generateDoc, parsePos, pdfToPngs } from '@/lib/docxgen';

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
  if (new URL(req.url).searchParams.get('format') === 'pages') {
    // Blank a mark only when it has a parseable position — same rule as
    // generateDoc. Positioned marks are drawn by the UI overlay; unpositioned
    // ones stay baked in at the template's inline spot, exactly where the
    // saved PDF puts them.
    const blanked: Record<string, string> = Object.fromEntries(
      (['ttd', 'stempel', 'ttd2', 'stempel2', 'logoMitra'] as const)
        .filter((k) => parsePos(data[k + 'Pos']))
        .map((k) => [k, ''])
    );
    const { pdf } = await generateDoc(def.file, { ...data, ...blanked });
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
