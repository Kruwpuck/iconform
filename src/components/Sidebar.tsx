import { signOut } from '@/auth';
import { LayoutDashboard, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function Sidebar() {
  return (
    <aside className="bg-blue-950 text-white w-64 flex-shrink-0 flex flex-col min-h-screen p-4">
      {/* PLN badge */}
      <div className="flex items-center gap-0 mb-2">
        <span className="bg-amber-500 text-black font-bold px-2 py-0.5 rounded-l text-xs select-none">PLN</span>
        <span className="bg-sky-400 text-black font-semibold px-2 py-0.5 rounded-r text-xs select-none">iconplus</span>
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
