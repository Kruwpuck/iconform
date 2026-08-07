import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { generateSecret, generateURI, verify as totpVerify } from 'otplib';
import { prisma } from '@/lib/prisma';

async function getUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id } });
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ enabled: user.twoFactorEnabled });
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { action: string; secret?: string; code?: string };

  if (body.action === 'setup') {
    const secret = generateSecret();
    const qrUrl = generateURI({ label: user.username, issuer: 'PDL FORM', secret });
    return NextResponse.json({ secret, qrUrl });
  }

  if (body.action === 'verify') {
    const { secret, code } = body;
    if (!secret || !code) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    const result = await totpVerify({ token: code, secret });
    if (!result.valid) return NextResponse.json({ error: 'Kode tidak valid' }, { status: 400 });
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: secret, twoFactorEnabled: true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Require current TOTP code to disable 2FA (step-up auth)
  if (user.twoFactorEnabled) {
    const body = await req.json().catch(() => ({})) as { code?: string };
    const code = body.code ? String(body.code).trim() : '';
    if (!code) return NextResponse.json({ error: 'Kode 2FA diperlukan' }, { status: 400 });
    const result = await totpVerify({ token: code, secret: user.totpSecret! });
    if (!result.valid) return NextResponse.json({ error: 'Kode tidak valid' }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: false, totpSecret: null },
  });
  return NextResponse.json({ ok: true });
}
