'use client';

import { useEffect, useState, FormEvent } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ctx, setCtx] = useState<{ forced: boolean; twoFactorEnabled: boolean } | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/user/reset-password').then(r => r.json()).then(setCtx).catch(() => setCtx(null));
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) { setError('Password baru minimal 8 karakter.'); return; }
    if (newPassword !== confirm) { setError('Konfirmasi password tidak cocok.'); return; }
    setLoading(true);
    const res = await fetch('/api/user/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword, totpCode }),
    });
    setLoading(false);
    if (res.ok) {
      setDone(true);
      // forced (first-login) → JWT still flags mustChangePassword; re-login clears it
      if (ctx?.forced) setTimeout(() => signOut({ callbackUrl: '/login' }), 1500);
      return;
    }
    const d = await res.json().catch(() => ({}));
    if (d.error === '2FA_REQUIRED_SETUP') { setCtx(c => c && { ...c, twoFactorEnabled: false }); return; }
    setError(d.error ?? 'Gagal mengganti password.');
  }

  if (ctx === null) return <div className="min-h-screen flex items-center justify-center text-slate-500">Memuat…</div>;

  // Voluntary reset requires 2FA first
  if (!ctx.forced && !ctx.twoFactorEnabled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-sky-800 to-teal-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center space-y-4">
          <h1 className="text-xl font-bold text-slate-800">Aktifkan 2FA Dulu</h1>
          <p className="text-sm text-slate-500">Ganti password mandiri wajib mengaktifkan autentikasi dua faktor (2FA) terlebih dahulu.</p>
          <Link href="/settings/2fa" className="inline-block px-4 py-2 rounded-lg bg-sky-600 text-white text-sm hover:bg-sky-700">
            Ke Pengaturan 2FA
          </Link>
          <div><Link href="/" className="text-sm text-slate-400 hover:text-slate-600">← Kembali</Link></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-sky-800 to-teal-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">Ganti Password</h1>
        <p className="text-slate-500 text-sm mb-6">
          {ctx.forced ? 'Password default wajib diganti sebelum melanjutkan.' : 'Ganti password akun Anda.'}
        </p>

        {done ? (
          <div className="px-4 py-3 rounded-lg bg-green-50 text-green-700 text-sm">
            Password berhasil diganti.{ctx.forced ? ' Mengalihkan ke login…' : ''}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password Saat Ini</label>
              <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" autoComplete="current-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password Baru</label>
              <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" autoComplete="new-password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Konfirmasi Password Baru</label>
              <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" autoComplete="new-password" />
            </div>
            {!ctx.forced && ctx.twoFactorEnabled && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Kode Google Authenticator</label>
                <input type="text" inputMode="numeric" maxLength={6} required value={totpCode}
                  onChange={e => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-sky-500" placeholder="000000" />
              </div>
            )}
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg transition-colors">
              {loading ? 'Menyimpan…' : 'Simpan Password'}
            </button>
            {!ctx.forced && (
              <button type="button" onClick={() => router.push('/')} className="w-full text-sm text-slate-500 hover:text-slate-700 py-1">
                Batal
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
