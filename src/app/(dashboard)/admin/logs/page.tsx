import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import LogViewer from './LogViewer';

// Log Aktivitas is a normal feature now: every signed-in user can read it.
export default async function AdminLogsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  return <LogViewer />;
}
