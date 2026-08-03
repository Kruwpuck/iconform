import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import LogViewer from './LogViewer';

export default async function AdminLogsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (!session.user.isAdmin) redirect('/');
  return <LogViewer />;
}
