import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { streamFile } from '@/lib/gdrive';
import { templateById } from '@/lib/templates';
import { generateDoc, fillDocx } from '@/lib/docxgen';
import { NextResponse } from 'next/server';
import type { Document } from '@prisma/client';

type Params = { params: Promise<{ id: string }> };

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

type StoredDoc = Pick<Document, 'contentHtml' | 'logoBase64' | 'template'>;

/** Regenerate one half of the pair from stored form data; null if not possible. */
async function rebuild(doc: StoredDoc, type: 'pdf' | 'docx'): Promise<Buffer | null> {
  const def = templateById(doc.template);
  if (!def) return null;
  let data: Record<string, string>;
  try {
    const parsed = JSON.parse(doc.contentHtml);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    data = parsed as Record<string, string>;
  } catch {
    return null;
  }
  if (doc.logoBase64) data.logoMitra = doc.logoBase64;
  // DOCX skips generateDoc: its docx half is plain fillDocx, no LibreOffice run.
  if (type === 'docx') return fillDocx(def.file, data);
  return (await generateDoc(def.file, data)).pdf;
}

export async function GET(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const type = new URL(req.url).searchParams.get('type');

  if (type !== 'pdf' && type !== 'docx')
    return NextResponse.json({ error: 'type must be pdf or docx' }, { status: 400 });

  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Rebuild from the stored form data instead of streaming the Drive copy, so a
  // template fix reaches documents archived before it. Falls back to the Drive
  // file for legacy rows whose contentHtml isn't usable form JSON.
  const rebuilt = await rebuild(doc, type).catch(() => null);
  if (rebuilt)
    return new Response(new Uint8Array(rebuilt), {
      headers: {
        'Content-Type': MIME[type],
        'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.filename)}.${type}"`,
      },
    });

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
