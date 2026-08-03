import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireSeedAdmin, randomPassword } from '@/lib/users';
import { logAction } from '@/lib/audit';

// guard: target must be an account the seed admin provisioned
async function ownedTarget(adminId: string, id: string) {
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.createdById !== adminId) return null;
  return target;
}

// PATCH → edit name/email/username, or reset the account's password
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSeedAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const target = await ownedTarget(admin.id, id);
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });

  const body = await req.json().catch(() => ({})) as
    { name?: string; email?: string; username?: string; resetPassword?: boolean };

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'Nama wajib diisi' }, { status: 400 });
    data.name = name;
  }
  if (body.email !== undefined) data.email = body.email ? String(body.email).trim() : null;
  if (body.username !== undefined) {
    const username = String(body.username).trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
      return NextResponse.json({ error: 'Username 3-32 char, huruf/angka/._- saja' }, { status: 400 });
    }
    const clash = await prisma.user.findUnique({ where: { username } });
    if (clash && clash.id !== id) return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 409 });
    data.username = username;
  }

  // Admin-triggered password reset → new random one-time password + force change
  let password: string | undefined;
  if (body.resetPassword) {
    password = randomPassword();
    data.passwordHash = await bcrypt.hash(password, 10);
    data.mustChangePassword = true;
  }

  await prisma.user.update({ where: { id }, data });
  await logAction(password ? 'USER_RESET_PW' : 'USER_EDIT',
    (data.username as string) ?? target.username, { id: admin.id, name: admin.name });
  return NextResponse.json({ ok: true, ...(password ? { password } : {}) });
}

// DELETE → remove a provisioned account (never the admin itself)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSeedAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  if (id === admin.id) return NextResponse.json({ error: 'Tidak bisa hapus diri sendiri' }, { status: 400 });
  const target = await ownedTarget(admin.id, id);
  if (!target) return NextResponse.json({ error: 'User tidak ditemukan' }, { status: 404 });

  // documents reference createdById → reassign to admin so history survives
  await prisma.document.updateMany({ where: { createdById: id }, data: { createdById: admin.id } });
  await prisma.user.delete({ where: { id } });
  await logAction('USER_DELETE', target.username, { id: admin.id, name: admin.name });
  return NextResponse.json({ ok: true });
}
