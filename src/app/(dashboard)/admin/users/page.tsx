import { redirect } from 'next/navigation';
import { auth } from '@/server/auth';
import UsersManager from './UsersManager';

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session) redirect('/login');
  if (!session.user.isAdmin) redirect('/');
  return <UsersManager />;
}
