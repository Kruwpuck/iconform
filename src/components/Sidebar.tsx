import { auth, signOut } from '@/auth';
import { LayoutDashboard, LogOut, FileText, ShieldCheck, Users, KeyRound, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { TEMPLATES } from '@/lib/templates';
import SidebarShell from '@/components/SidebarShell';

// Text that disappears when SidebarShell is collapsed, leaving icons only.
const LABEL = 'group-data-[collapsed]/sb:hidden';
const LINK =
  'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors group-data-[collapsed]/sb:justify-center group-data-[collapsed]/sb:px-0';

export default async function Sidebar() {
  const session = await auth();
  const isAdmin = session?.user?.isAdmin;
  return (
    <SidebarShell>
      <div className="mb-4">
        <img src="/icon2.png" alt="PLN Icon Plus" className="h-10 w-auto group-data-[collapsed]/sb:mx-auto" />
      </div>
      <h2 className={`text-lg font-bold text-white mb-6 ${LABEL}`}>PDL FORM</h2>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        <Link href="/" title="Dashboard" className={`${LINK} text-white hover:bg-blue-800`}>
          <LayoutDashboard size={16} className="shrink-0" />
          <span className={LABEL}>Dashboard</span>
        </Link>

        <p className={`text-xs text-blue-400 uppercase tracking-wider px-3 pt-4 pb-1 ${LABEL}`}>Jenis Surat</p>
        {TEMPLATES.map((t) => (
          <Link
            key={t.id}
            href={`/surat/${t.id}`}
            title={t.label}
            className={`${LINK} text-white/80 hover:bg-blue-800 hover:text-white`}
          >
            <FileText size={14} className="shrink-0" />
            <span className={LABEL}>{t.label}</span>
          </Link>
        ))}
        {isAdmin && (
          <>
            <p className={`text-xs text-blue-400 uppercase tracking-wider px-3 pt-4 pb-1 ${LABEL}`}>Admin</p>
            <Link
              href="/admin/users"
              title="Kelola User"
              className={`${LINK} text-white/80 hover:bg-blue-800 hover:text-white`}
            >
              <Users size={14} className="shrink-0" />
              <span className={LABEL}>Kelola User</span>
            </Link>
            <Link
              href="/admin/logs"
              title="Log Aktivitas"
              className={`${LINK} text-white/80 hover:bg-blue-800 hover:text-white`}
            >
              <ScrollText size={14} className="shrink-0" />
              <span className={LABEL}>Log Aktivitas</span>
            </Link>
          </>
        )}

        <p className={`text-xs text-blue-400 uppercase tracking-wider px-3 pt-4 pb-1 ${LABEL}`}>Akun</p>
        <Link
          href="/settings/2fa"
          title="Keamanan 2FA"
          className={`${LINK} text-white/80 hover:bg-blue-800 hover:text-white`}
        >
          <ShieldCheck size={14} className="shrink-0" />
          <span className={LABEL}>Keamanan 2FA</span>
        </Link>
        <Link
          href="/reset-password"
          title="Ganti Password"
          className={`${LINK} text-white/80 hover:bg-blue-800 hover:text-white`}
        >
          <KeyRound size={14} className="shrink-0" />
          <span className={LABEL}>Ganti Password</span>
        </Link>
      </nav>

      {/* Sign out */}
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: '/login' });
        }}
      >
        <button
          type="submit"
          title="Keluar"
          className={`${LINK} w-full text-white/80 hover:bg-blue-800 hover:text-white`}
        >
          <LogOut size={16} className="shrink-0" />
          <span className={LABEL}>Keluar</span>
        </button>
      </form>
    </SidebarShell>
  );
}
