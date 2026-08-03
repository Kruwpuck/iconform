'use client';

import { useEffect, useState } from 'react';
import { FilePlus, FilePenLine, FileX, UserPlus, UserCog, UserX, KeyRound } from 'lucide-react';

type Log = { id: string; action: string; target: string; actorName: string; createdAt: string };

const META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  DOC_CREATE:    { label: 'Buat dokumen',   icon: <FilePlus size={15} />,     color: 'text-green-600' },
  DOC_EDIT:      { label: 'Edit dokumen',   icon: <FilePenLine size={15} />,  color: 'text-sky-600' },
  DOC_DELETE:    { label: 'Hapus dokumen',  icon: <FileX size={15} />,        color: 'text-red-600' },
  USER_CREATE:   { label: 'Buat user',      icon: <UserPlus size={15} />,     color: 'text-green-600' },
  USER_EDIT:     { label: 'Edit user',      icon: <UserCog size={15} />,      color: 'text-sky-600' },
  USER_DELETE:   { label: 'Hapus user',     icon: <UserX size={15} />,        color: 'text-red-600' },
  USER_RESET_PW: { label: 'Reset password', icon: <KeyRound size={15} />,     color: 'text-amber-600' },
};

export default function LogViewer() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/logs').then(r => r.ok ? r.json() : []).then(setLogs).finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Log Aktivitas</h1>
      <p className="text-slate-500 text-sm mb-6">200 aktivitas terakhir — dokumen dibuat/diedit/dihapus dan perubahan akun.</p>

      {loading ? <p className="text-slate-500 text-sm">Memuat…</p> : logs.length === 0 ? (
        <p className="text-slate-400 text-sm">Belum ada aktivitas.</p>
      ) : (
        <ol className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {logs.map(l => {
            const m = META[l.action] ?? { label: l.action, icon: null, color: 'text-slate-500' };
            return (
              <li key={l.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <span className={m.color}>{m.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-slate-700">{m.label}</span>
                  <span className="text-slate-400"> — </span>
                  <span className="font-mono text-slate-600 break-all">{l.target}</span>
                </div>
                <div className="text-right text-xs text-slate-400 shrink-0">
                  <div>{l.actorName}</div>
                  <div>{new Date(l.createdAt).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}</div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
