import { signOut } from '@/auth';
import { LayoutDashboard, LogOut, FileText } from 'lucide-react';
import Link from 'next/link';
import { TEMPLATES } from '@/lib/templates';

export default function Sidebar() {
  return (
    <aside className="bg-blue-950 text-white w-64 flex-shrink-0 flex flex-col min-h-screen p-4">
      <div className="mb-4">
        <img src="/icon2.png" alt="PLN Icon Plus" className="h-10 w-auto" />
      </div>
      <h2 className="text-lg font-bold text-white mb-6">ICONFORM</h2>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white hover:bg-blue-800 transition-colors"
        >
          <LayoutDashboard size={16} />
          Dashboard
        </Link>

        <p className="text-xs text-blue-400 uppercase tracking-wider px-3 pt-4 pb-1">Jenis Surat</p>
        {TEMPLATES.map((t) => (
          <Link
            key={t.id}
            href={`/surat/${t.id}`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-blue-800 hover:text-white transition-colors"
          >
            <FileText size={14} />
            {t.label}
          </Link>
        ))}
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
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-white/80 hover:bg-blue-800 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Keluar
        </button>
      </form>
    </aside>
  );
}
