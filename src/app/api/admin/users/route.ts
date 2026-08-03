import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireSeedAdmin, randomPassword } from '@/lib/users';
import { logAction } from '@/lib/audit';

// GET → list accounts provisioned by the seed admin
export async function GET() {
  const admin = await requireSeedAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { createdById: admin.id },
    select: {
      id: true, username: true, name: true, email: true,
      twoFactorEnabled: true, mustChangePassword: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(users);
}

// POST → provision a new account with a random one-time password
export async function POST(req: NextRequest) {
  const admin = await requireSeedAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { username?: string; name?: string; email?: string };
  const username = String(body.username ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  const email = body.email ? String(body.email).trim() : null;

  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    return NextResponse.json({ error: 'Username 3-32 char, huruf/angka/._- saja' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: 'Nama wajib diisi' }, { status: 400 });

  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) return NextResponse.json({ error: 'Username sudah dipakai' }, { status: 409 });

  const password = randomPassword();
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, name, email, passwordHash, mustChangePassword: true, createdById: admin.id },
    select: { id: true, username: true, name: true },
  });

  await logAction('USER_CREATE', username, { id: admin.id, name: admin.name });
  // plaintext password returned ONCE — admin must copy it now
  return NextResponse.json({ ...user, password });
}
