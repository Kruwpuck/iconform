import 'server-only';
import { prisma } from '@/server/infra/prisma';

export type AuditAction =
  | 'DOC_CREATE' | 'DOC_EDIT' | 'DOC_DELETE'
  | 'USER_CREATE' | 'USER_EDIT' | 'USER_DELETE' | 'USER_RESET_PW';

/** Append an activity-log entry. Never throws — logging must not break the action. */
export async function logAction(
  action: AuditAction,
  target: string,
  actor: { id?: string | null; name?: string | null },
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        target: target.slice(0, 300),
        actorId: actor.id ?? 'unknown',
        actorName: actor.name ?? 'unknown',
      },
    });
  } catch { /* audit failure is non-fatal */ }
}
