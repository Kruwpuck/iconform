import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { streamFile } from '@/lib/storage';
import { NextResponse } from 'next/server';

type Params = { params: Promise<{ id: string }> };

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const type = new URL(req.url).searchParams.get('type');

  if (type !== 'pdf' && type !== 'docx')
    return NextResponse.json({ error: 'type must be pdf or docx' }, { status: 400 });

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fileId = type === 'pdf' ? doc.driveFileIdPdf : doc.driveFileIdDocx;
  const nodeStream = await streamFile(fileId);

  // Convert Node.js Readable to Web ReadableStream for NextResponse
  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
      nodeStream.on('end', () => controller.close());
      nodeStream.on('error', (err) => controller.error(err));
    },
  });

  return new Response(webStream, {
    headers: {
      'Content-Type': MIME[type],
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.filename)}.${type}"`,
    },
  });
}
