'use client';

import { useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [require2fa, setRequire2fa] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (require2fa) {
      const result = await signIn('credentials', { username, password, totpCode, redirect: false });
      setLoading(false);
      if (result?.error) {
        setError('Kode 2FA tidak valid.');
      } else {
        router.push('/');
      }
      return;
    }

    const result = await signIn('credentials', { username, password, redirect: false });
    setLoading(false);
    if (result?.code === '2FA_REQUIRED') {
      setRequire2fa(true);
    } else if (result?.error) {
      setError('Username atau password salah.');
    } else {
      router.push('/');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-sky-800 to-teal-700 flex items-center justify-center p-4">
      <div className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src="/icon2.png" alt="PLN Icon Plus" className="h-14 w-auto" />
        </div>

        <h1 className="text-3xl font-bold text-center text-slate-800 mb-1">PDL FORM</h1>
        <p className="text-center text-slate-500 text-sm mb-8">Regional Jawa Barat</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!require2fa ? (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Masukkan username"
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Masukkan password"
                  autoComplete="current-password"
                />
              </div>
            </>
          ) : (
            <div>
              <p className="text-sm text-slate-600 mb-3 text-center">
                Masukkan kode dari aplikasi Google Authenticator.
              </p>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Kode Google Authenticator
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 tracking-widest text-center text-lg"
                placeholder="000000"
              />
            </div>
          )}

          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold py-2 rounded-lg transition-colors"
          >
            {loading ? 'Memproses…' : require2fa ? 'Verifikasi' : 'Masuk ke Sistem'}
          </button>

          {require2fa && (
            <button
              type="button"
              onClick={() => { setRequire2fa(false); setTotpCode(''); setError(''); }}
              className="w-full text-sm text-slate-500 hover:text-slate-700 py-1"
            >
              ← Kembali
            </button>
          )}
        </form>

        {!require2fa && process.env.NEXT_PUBLIC_ENABLE_EMAIL_AUTH === 'true' && (
          <div className="mt-6 pt-6 border-t border-slate-200 text-center">
            <p className="text-sm text-slate-500 mb-3">atau</p>
            <button
              onClick={() => signIn('email')}
              className="w-full border border-slate-300 rounded-lg py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Masuk dengan Email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
