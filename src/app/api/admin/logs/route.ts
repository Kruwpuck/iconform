import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireSeedAdmin } from '@/lib/users';

// GET → recent activity log (seed admin only)
export async function GET() {
  const admin = await requireSeedAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json(logs);
}
