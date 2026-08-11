import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { verify as totpVerify } from 'otplib';
import { auth } from '@/server/auth';
import { prisma } from '@/server/infra/prisma';

// GET → context for the reset page: is this a forced reset, is 2FA enabled
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    forced: user.mustChangePassword,
    twoFactorEnabled: user.twoFactorEnabled,
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({})) as
    { currentPassword?: string; newPassword?: string; totpCode?: string };
  const currentPassword = String(body.currentPassword ?? '');
  const newPassword = String(body.newPassword ?? '');

  if (newPassword.length < 8) {
    return NextResponse.json({ error: 'Password baru minimal 8 karakter' }, { status: 400 });
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: 'Password saat ini salah' }, { status: 400 });

  // Voluntary reset (not first-login) requires 2FA enabled + a valid TOTP code.
  // First-login forced reset is exempt: the new account has no 2FA yet.
  if (!user.mustChangePassword) {
    if (!user.twoFactorEnabled) {
      return NextResponse.json({ error: '2FA_REQUIRED_SETUP' }, { status: 403 });
    }
    const code = body.totpCode ? String(body.totpCode).trim() : '';
    if (!code) return NextResponse.json({ error: 'Kode 2FA diperlukan' }, { status: 400 });
    const result = await totpVerify({ token: code, secret: user.totpSecret! });
    if (!result.valid) return NextResponse.json({ error: 'Kode 2FA tidak valid' }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false },
  });
  return NextResponse.json({ ok: true });
}
