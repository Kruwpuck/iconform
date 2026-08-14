'use client';

import { useEffect, useState } from 'react';
import { UserPlus, Trash2, Pencil, KeyRound, Copy, Check } from 'lucide-react';

type ManagedUser = {
  id: string; username: string; name: string; email: string | null;
  mustChangePassword: boolean; createdAt: string;
};

export default function UsersManager() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [creds, setCreds] = useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // create form
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  async function load() {
    setLoading(true);
    const r = await fetch('/api/admin/users');
    setUsers(r.ok ? await r.json() : []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg(''); setCreds(null);
    const r = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, name, email: email || undefined }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error ?? 'Gagal membuat user.'); return; }
    setCreds({ username: d.username, password: d.password });
    setUsername(''); setName(''); setEmail('');
    load();
  }

  async function remove(u: ManagedUser) {
    if (!confirm(`Hapus user "${u.username}"? Dokumen miliknya dialihkan ke Anda.`)) return;
    const r = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error ?? 'Gagal hapus.'); return; }
    load();
  }

  async function resetPw(u: ManagedUser) {
    if (!confirm(`Reset password "${u.username}"? Password baru acak akan dibuat.`)) return;
    const r = await fetch(`/api/admin/users/${u.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPassword: true }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(d.error ?? 'Gagal reset.'); return; }
    setCreds({ username: u.username, password: d.password });
    load();
  }

  function startEdit(u: ManagedUser) { setEditId(u.id); setEditName(u.name); setEditEmail(u.email ?? ''); }
  async function saveEdit(id: string) {
    const r = await fetch(`/api/admin/users/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName, email: editEmail || null }),
    });
    if (!r.ok) { const d = await r.json().catch(() => ({})); setMsg(d.error ?? 'Gagal simpan.'); return; }
    setEditId(null); load();
  }

  function copyCreds() {
    if (!creds) return;
    navigator.clipboard.writeText(`Username: ${creds.username}\nPassword: ${creds.password}`);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">Kelola User</h1>
      <p className="text-slate-500 text-sm mb-6">Buat, edit, dan hapus akun. User baru dapat password acak dan wajib menggantinya saat login pertama.</p>

      {msg && <div className="mb-4 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{msg}</div>}

      {/* one-time credentials banner */}
      {creds && (
        <div className="mb-6 p-4 rounded-xl border border-amber-300 bg-amber-50">
          <p className="text-sm font-medium text-amber-800 mb-2">Simpan kredensial ini sekarang — password hanya ditampilkan sekali:</p>
          <div className="flex items-center gap-3 font-mono text-sm bg-white rounded-lg px-3 py-2 border border-amber-200">
            <span>{creds.username}</span><span className="text-slate-300">/</span><span>{creds.password}</span>
            <button onClick={copyCreds} className="ml-auto text-amber-700 hover:text-amber-900 flex items-center gap-1">
              {copied ? <><Check size={14} />Disalin</> : <><Copy size={14} />Salin</>}
            </button>
          </div>
        </div>
      )}

      {/* create form */}
      <form onSubmit={create} className="mb-8 p-4 rounded-xl border border-slate-200 bg-white grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nama Lengkap" required
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (opsional)" type="email"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        <button type="submit" className="sm:col-span-3 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">
          <UserPlus size={16} /> Buat User
        </button>
      </form>

      {/* list */}
      {loading ? <p className="text-slate-500 text-sm">Memuat…</p> : (
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Username</th>
                <th className="text-left px-4 py-2 font-medium">Nama</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Belum ada user.</td></tr>}
              {users.map(u => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-4 py-2 font-mono">{u.username}</td>
                  <td className="px-4 py-2">
                    {editId === u.id ? (
                      <div className="flex flex-col gap-1">
                        <input value={editName} onChange={e => setEditName(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm" />
                        <input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="email" className="border border-slate-300 rounded px-2 py-1 text-sm" />
                      </div>
                    ) : (
                      <div><span>{u.name}</span>{u.email && <span className="block text-xs text-slate-400">{u.email}</span>}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-flex gap-1 flex-wrap">
                      {u.mustChangePassword && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Belum ganti pw</span>}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-2">
                      {editId === u.id ? (
                        <>
                          <button onClick={() => saveEdit(u.id)} className="text-sky-600 hover:text-sky-800 text-xs">Simpan</button>
                          <button onClick={() => setEditId(null)} className="text-slate-400 hover:text-slate-600 text-xs">Batal</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(u)} title="Edit" className="text-slate-500 hover:text-sky-600"><Pencil size={15} /></button>
                          <button onClick={() => resetPw(u)} title="Reset password" className="text-slate-500 hover:text-amber-600"><KeyRound size={15} /></button>
                          <button onClick={() => remove(u)} title="Hapus" className="text-slate-500 hover:text-red-600"><Trash2 size={15} /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
