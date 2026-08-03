import { randomBytes } from 'crypto';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

/** 16-byte hex → 32-char random password for freshly provisioned accounts. */
export function randomPassword(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Resolve the current session's user and confirm it's the seed admin
 * (the only account with createdById === null). Returns null otherwise.
 */
export async function requireSeedAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.createdById !== null) return null;
  return user;
}
