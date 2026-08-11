import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// GET → recent activity log. Deliberately open to every signed-in user: the
// log moved out of the admin section and into the normal feature list. Note
// this exposes every actor's activity, not just the caller's own.
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json(logs);
}
